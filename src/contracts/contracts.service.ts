import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus, InvoiceStatus, InvoiceType, User } from '@prisma/client';
import { PdfService } from 'src/pdf/pdf.service';
import { StorageService } from 'src/storage/storage.service';

export interface LeasePdfPayload {
  // Infos du contrat
  reference: string;
  designation: string;
  address: string;
  rentAmount: number;
  chargesAmount: number;
  depositAmount: number;
  startDate: string; // Format lisible ex: "01 mars 2024"
  endDate?: string;

  // Infos Propriétaire (Bailleur)
  ownerFullName: string;
  ownerAddress?: string;
  ownerProfession?: string;
  ownerPhoneNumber: string;


  // Infos Locataire
  // tenantTest: User;
  tenantFullName: string;
  tenantAddress?: string;
  tenantBirthDate?: string;
  tenantProfession?: string;
  tenantPhoneNumber: string;

  // ... ajoute ici tout ce que ton futur modèle de bail nécessitera
}


function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ymd}-${Date.now()}-${rand}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function setDayOfMonth(date: Date, day: number): Date {
  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), daysInMonth);
  d.setDate(safeDay);
  return d;
}

function computeFirstRentDueDate(
  startDate: Date,
  paymentStartAfterMonths: number,
  dayOfMonth: number,
): Date {
  const base = addMonths(startDate, paymentStartAfterMonths);
  return setDayOfMonth(base, dayOfMonth);
}

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService,
    private pdfService: PdfService,
    private storageService: StorageService
  ) { }

  async create(adminId: number,
    dto: CreateContractDto
  ) {
    // 1. Récupération Admin & Org
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { organization: true, ownerProfile: true },
    });
    if (!admin?.organization) throw new ForbiddenException('Pas d\'organisation');

    // 2. Validation Locataire
    const tenantUser = await this.prisma.user.findUnique({
      where: { id: dto.tenantId },
      include: { tenantProfile: true },
    });

    if (!tenantUser || tenantUser.organizationId !== admin.organizationId) {
      throw new NotFoundException('Locataire introuvable ou hors organisation');
    }

    if (!tenantUser.tenantProfile) {
      throw new NotFoundException('Profil locataire introuvable pour cet utilisateur');
    }

    // 3. Gestion du Profil Owner (Créateur = Propriétaire bailleur)
    let ownerProfile = admin.ownerProfile;
    if (!ownerProfile) {
      ownerProfile = await this.prisma.owner.create({ data: { userId: adminId } });
    }

    // Vérifie si le locataire a déjà un contrat actif pour cette location
    const existingContract = await this.prisma.contract.findFirst({
      where: {
        tenantId: dto.tenantId,
        designation: dto.designation,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
    });

    if (existingContract) {
      throw new ConflictException(`Le locataire possède déjà un contrat actif pour cette location.`);
    }

    try {
      // On lance la transaction
      const contract = await this.prisma.$transaction(async (tx) => {

        // -- GÉNÉRATION DE LA RÉFÉRENCE ---
        const reference = await this.generateContractReference(tx, admin.organizationId);

        // --- 1. CALCULS ---
        const rentDepositMonths = dto.rentDeposit || 0;
        const rentAdvanceMonths = dto.rentAdvance || 0;

        // Montants
        const totalDepositAmount = dto.rentAmount * rentDepositMonths;
        const totalAdvanceAmount = dto.rentAmount * rentAdvanceMonths; // Pas de charges sur l'avance (ta règle)

        // A. Création du Contrat
        const createdContract = await tx.contract.create({
          data: {
            designation: dto.designation,
            address: dto.address,
            reference: reference,
            rentDeposit: dto.rentDeposit || 0,
            rentAdvance: dto.rentAdvance || 0,
            rentAmount: dto.rentAmount,
            chargesAmount: dto.chargesAmount || 0,
            depositAmount: dto.depositAmount || 0, //totalDepositAmount
            advanceAmount: dto.advanceAmount || 0, //totalAdvanceAmount
            startDate: new Date(dto.startDate),
            endDate: dto.endDate ? new Date(dto.endDate) : null,
            paymentStartAfter: dto.paymentStartAfter || 0,
            dayAddToPaymentDay: dto.dayAddToPaymentDay || 1,
            status: ContractStatus.ACTIVE,
            leaseType: dto.leaseType,

            // Relations
            tenant: { connect: { userId: dto.tenantId } },
            owner: { connect: { id: ownerProfile.id } },
            organization: { connect: { id: admin.organizationId } },
          },
        });

        // --- 2. CRÉATION DES FACTURES "CAPITALES" ---

        // A. Facture de CAUTION (Dépôt de garantie)
        if (totalDepositAmount > 0) {
          await tx.invoice.create({
            data: {
              invoiceNumber: makeInvoiceNumber('DEP'),
              contractId: createdContract.id,
              tenantId: tenantUser.tenantProfile!.id,
              organizationId: admin.organizationId,
              amountDue: totalDepositAmount,
              paidAmount: totalDepositAmount, // payer à la signature
              type: InvoiceType.DEPOSIT,
              status: InvoiceStatus.PAID,
              dueDate: createdContract.startDate,
              paidDate: createdContract.startDate
            },
          });
        }

        // B. Facture d'AVANCE (Porte-monnaie / Crédit)
        // Cette facture représente l'argent que le locataire a "posé" sur la table.
        // On considère qu'il a payé cette somme à la signature.
        if (totalAdvanceAmount > 0) {
          await tx.invoice.create({
            data: {
              invoiceNumber: makeInvoiceNumber('ADV'),
              contractId: createdContract.id,
              tenantId: tenantUser.tenantProfile!.id,
              organizationId: admin.organizationId,
              amountDue: totalAdvanceAmount,
              paidAmount: totalAdvanceAmount, // IMPORTANT : Déjà "payé" (crédit disponible)
              type: InvoiceType.ADVANCE,
              status: InvoiceStatus.PAID, // Statut payé
              dueDate: createdContract.startDate,
              paidDate: createdContract.startDate,
            },
          });
        }

        // --- 3. CRÉATION DE LA PREMIÈRE FACTURE DE LOYER ---
        // Logique : On attend 'paymentStartAfter' mois.

        // Si paymentStartAfter n'est pas fourni, on le déduit de l'avance (logique par défaut)
        const startAfter = dto.paymentStartAfter ?? rentAdvanceMonths;

        // Calcul de la date de la première facture
        let firstRentDueDate: Date;

        if (startAfter > 0) {
          // Si on saute des mois (ex: avance de 2 mois)
          // La première facture est due dans 'startAfter' mois
          firstRentDueDate = addMonths(createdContract.startDate, startAfter);
        } else {
          // Si pas de saut, c'est le mois prochain (ou ce mois si logique immédiate)
          // Ici, on considère que c'est le mois prochain pour le premier loyer "normal"
          firstRentDueDate = addMonths(createdContract.startDate, 1);
        }

        // Ajustement au jour de prélèvement (ex: le 5 du mois)
        const paymentDay = dto.dayAddToPaymentDay || 1;
        firstRentDueDate = setDayOfMonth(firstRentDueDate, paymentDay);

        // Création de la facture de Loyer
        await tx.invoice.create({
          data: {
            invoiceNumber: makeInvoiceNumber('RENT'),
            contractId: createdContract.id,
            tenantId: tenantUser.tenantProfile!.id,
            organizationId: admin.organizationId,
            amountDue: dto.rentAmount + (dto.chargesAmount || 0),
            paidAmount: 0,
            type: InvoiceType.RENT,
            status: InvoiceStatus.PENDING,
            dueDate: firstRentDueDate,
          },
        });

        // ==========================================
        // D. PRÉPARATION DES DONNÉES POUR LE PDF
        // ==========================================
        const pdfData: LeasePdfPayload = {
          reference: reference,
          designation: dto.designation,
          address: dto.address,
          rentAmount: dto.rentAmount,
          chargesAmount: dto.chargesAmount || 0,
          depositAmount: dto.depositAmount || 0,
          startDate: new Date(dto.startDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
          endDate: dto.endDate ? new Date(dto.endDate).toISOString() : undefined,

          // On utilise les données récupérées en début de fonction !
          ownerFullName: `${admin.lastName} ${admin.firstName}`,
          ownerAddress: admin.address || undefined,
          ownerProfession: admin.occupation || undefined,
          ownerPhoneNumber: admin.phoneNumber || "",

          // tenantTest: tenantUser,
          tenantFullName: `${tenantUser.lastName} ${tenantUser.firstName}`,
          tenantBirthDate: tenantUser.dateOfBirth ? tenantUser.dateOfBirth.toLocaleDateString('fr-FR') : undefined,
          tenantAddress: tenantUser.address || undefined,
          tenantProfession: tenantUser.occupation || undefined,
          tenantPhoneNumber: tenantUser.phoneNumber || "",
        };

        // ==========================================
        // E. GÉNÉRATION DU FICHIER PDF (En mémoire)
        // ==========================================
        // Le service PdfService prendra les données et retournera un Buffer (le fichier binaire)
        const pdfBuffer = await this.pdfService.generateLeasePdf(pdfData);

        // ==========================================
        // F. SAUVEGARDE DU FICHIER (Stockage)
        // ==========================================
        // On définit le chemin de stockage, ex: "contracts/BAIL-2024-0001.pdf"
        const storagePath = `contracts/${reference}.pdf`;
        // Le service StorageService upload le Buffer et retourne l'URL publique/privée
        const pdfUrl = await this.storageService.uploadFile(pdfBuffer, storagePath);




        // --- 4. MISE À JOUR DU CONTRAT ---
        // On sauvegarde les montants de référence
        await tx.contract.update({
          where: { id: createdContract.id },
          data: {
            depositAmount: totalDepositAmount,
            advanceAmount: totalAdvanceAmount, // On sauvegarde l'avance initiale
            pdfUrl: pdfUrl, // mise a jour du contrat avec l' URL du pdf
          },
        });


        return createdContract;

      }, {
        timeout: 30000 // Augmente le délai à 30 secondes (30000 ms) au lieu de 5000 ms
      });

      return this.findOne(contract.id, admin.organizationId);
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException("Erreur création contrat");
    }
  }

  async findAll(orgId: number) {
    return this.prisma.contract.findMany({
      where: { organizationId: orgId },
      include: {
        tenant: { include: { user: true } }, // Pour afficher nom locataire
        owner: { include: { user: true } },
        _count: {
          select: {
            invoices: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }


  async findOne(id: number, orgId: number) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, organizationId: orgId },
      include: {
        tenant: { include: { user: true } },
        owner: { include: { user: true } },
        invoices: { orderBy: { dueDate: 'desc' }, take: 5 },
        _count: {
          select: { invoices: true },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    return contract;
  }


  async update(id: number, orgId: number, dto: UpdateContractDto) {
    await this.findOne(id, orgId); // Check existence

    return this.prisma.contract.update({
      where: { id },
      data: {
        // On permet de modifier les montants ou dates
        rentAmount: dto.rentAmount,
        chargesAmount: dto.chargesAmount,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status,
      },
    });
  }

  async terminate(id: number, orgId: number) {

    const contract = await this.findOne(id, orgId);

    // Check if contract is already terminated or expired
    if (contract.status === ContractStatus.TERMINATED) {
      throw new ConflictException('Le contrat est déjà résilié.');
    }

    if (contract.status === ContractStatus.EXPIRED) {
      throw new ConflictException('Impossible de résilier un contrat expiré.');
    }

    try {
      const terminatedContract = await this.prisma.contract.update({
        where: { id },
        data: {
          status: ContractStatus.TERMINATED,
          endDate: new Date(), // Date de fin = aujourd'hui
        },
      });
      // Update rental status back to AVAILABLE (unless it was BOOKED)
      // if (contract.rental.status === RentalStatus.OCCUPIED) {
      //   await this.prisma.rental.update({
      //     where: { id: contract.rentalId },
      //     data: { status: RentalStatus.AVAILABLE },
      //   });
      // }

      return terminatedContract;
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException("Erreur résiliation contrat");
    }
  }

  async remove(id: number, orgId: number) {
    const contract = await this.findOne(id, orgId);

    // Soft delete ou Hard delete ?
    // Pour MVP, on fait un soft delete (désactivation) ou on garde l'historique.
    // Si tu veux hard delete, attention aux factures.
    // Je conseille de juste changer le statut à TERMINATED ou supprimer.
    // Hard delete - attention aux factures si FK restrict
    // Pour MVP on suppose onDelete Cascade ou on supprime les factures manuellement
    await this.prisma.invoice.deleteMany({ where: { contractId: id } });
    await this.prisma.contract.delete({ where: { id } });
    return { message: "Contrat supprimé" };
  }




  /**
 * Génère une référence unique de type BAIL-YYYY-0001
 * Doit être exécutée à l'intérieur d'une transaction Prisma
 */
  private async generateContractReference(
    tx: any, // 'any' temporaire, ou utilise le type Prisma.TransactionClient si tu l'as importé
    organizationId: number,
  ): Promise<string> {
    const year = new Date().getFullYear().toString();
    const prefix = `BAIL-${year}-`;

    // On cherche le dernier contrat créé pour cette organisation avec ce préfixe
    const lastContract = await tx.contract.findFirst({
      where: {
        organizationId: organizationId,
        reference: {
          startsWith: prefix,
        },
      },
      orderBy: {
        createdAt: 'desc', // On prend le plus récent
      },
    });

    let nextSequence = 1;

    if (lastContract) {
      // On extrait les 4 derniers caractères (ex: "0003" -> 3)
      const lastSequenceStr = lastContract.reference.slice(-4);
      const lastSequence = parseInt(lastSequenceStr, 10);
      nextSequence = lastSequence + 1;
    }

    // On formate avec des zéros initiaux pour toujours avoir 4 chiffres (ex: 4 -> "0004")
    const sequenceStr = nextSequence.toString().padStart(4, '0');

    return `${prefix}${sequenceStr}`;
  }
}
