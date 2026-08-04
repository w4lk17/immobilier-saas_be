import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus, InvoiceType, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/types';

function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ymd}-${Date.now()}-${rand}`;
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) { }

  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: RequestUser,
  ): Promise<Invoice> {
    // 1. Validate Contract existence
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: createInvoiceDto.contractId,
        organizationId: user.organizationId,
      },
      include: { manager: true },
    });
    if (!contract) {
      throw new NotFoundException(
        `Contract with ID ${createInvoiceDto.contractId} not found.`,
      );
    }

    // Ensure tenant ID matches the contract's tenant ID
    if (contract.tenantId !== createInvoiceDto.tenantId) {
      throw new ConflictException(
        `Tenant ID ${createInvoiceDto.tenantId} does not match the tenant on contract ID ${createInvoiceDto.contractId}.`,
      );
    }

    // 2. Authorization (Admin or Manager of the contract)
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.id } })
        : null;
    const isManagerOfContract =
      managerProfile && contract.managerId === managerProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can create invoices.',
      );
    }

    const invoiceNumber = createInvoiceDto.invoiceNumber || makeInvoiceNumber('RENT');

    try {
      return await this.prisma.invoice.create({
        data: {
          ...createInvoiceDto,
          invoiceNumber,
          // dueDate: // a ajouter ici  le jour de date d'echeance calculer
          organizationId: user.organizationId,
        },
        include: { contract: true, tenant: { include: { user: true } } },
      });
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw new InternalServerErrorException('Could not create invoice.');
    }
  }

  async findAll(user: RequestUser): Promise<Invoice[]> {
    const queryArgs: any = {
      include: {
        contract: {
          include: { property: { include: { owner: true } }, manager: true, owner: { include: { user: true } }, },
        },
        tenant: { include: { user: true } },
        transactions: true,
      },
      orderBy: { dueDate: 'desc' },
      where: { organizationId: user.organizationId },
    };

    if (user.role === UserRole.TENANT) {
      const tenantProfile = await this.prisma.tenant.findUnique({
        where: { userId: user.id },
      });
      if (!tenantProfile) return [];
      queryArgs.where = { ...queryArgs.where, tenantId: tenantProfile.id };
    } else if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.id },
      });
      if (!ownerProfile) return [];
      queryArgs.where = {
        ...queryArgs.where,
        contract: { property: { ownerId: ownerProfile.id } },
      };
    } else if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.id },
      });
      if (!managerProfile) return [];
      queryArgs.where = {
        ...queryArgs.where,
        contract: { managerId: managerProfile.id },
      };
    }

    return this.prisma.invoice.findMany(queryArgs);
  }

  async findOne(id: number, user: RequestUser): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        contract: {
          include: { property: { include: { owner: true } }, manager: true, owner: { include: { user: true } }, },
        },
        tenant: { include: { user: true } },
        transactions: true,
      },
    });

    if (!invoice || invoice.organizationId !== user.organizationId) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    // Authorization
    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.id } })
        : null;
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.id } })
        : null;
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.id } })
        : null;

    const isOwnerOfProperty =
      ownerProfile && invoice.contract.property?.ownerId === ownerProfile.id;
    const isTenantOfInvoice =
      tenantProfile && invoice.tenantId === tenantProfile.id;
    const isManagerOfContract =
      managerProfile && invoice.contract.managerId === managerProfile.id;

    if (
      user.role !== UserRole.ADMIN &&
      !isOwnerOfProperty &&
      !isTenantOfInvoice &&
      !isManagerOfContract
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this invoice.',
      );
    }

    return invoice;
  }

  async update(
    id: number,
    updateInvoiceDto: UpdateInvoiceDto,
    user: RequestUser,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { contract: true, tenant: true },
    });
    if (!invoice || invoice.organizationId !== user.organizationId) {
      throw new NotFoundException(`Invoice with ID "${id}" not found.`);
    }

    // Authorization (Admin or Manager of the contract)
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.id } })
        : null;
    const isManagerOfContract =
      managerProfile && invoice.contract.managerId === managerProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can update invoices.',
      );
    }

    try {
      return await this.prisma.invoice.update({
        where: { id },
        data: updateInvoiceDto,
        include: {
          contract: true,
          tenant: { include: { user: true } },
          transactions: true,
        },
      });
    } catch (error) {
      console.error('Error updating invoice:', error);
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(`Invoice with ID "${id}" not found.`);
      }
      throw new InternalServerErrorException('Could not update invoice.');
    }
  }

  async remove(id: number, user: RequestUser): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { contract: true, transactions: true },
    });
    if (!invoice || invoice.organizationId !== user.organizationId) {
      throw new NotFoundException(`Invoice with ID "${id}" not found.`);
    }

    // Authorization (Admin or Manager of the contract)
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.id } })
        : null;
    const isManagerOfContract =
      managerProfile && invoice.contract.managerId === managerProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can delete invoices.',
      );
    }

    // If there are transactions, block deletion (audit integrity)
    if (invoice.transactions.length > 0) {
      throw new ConflictException(
        'Cannot delete an invoice that has payment transactions.',
      );
    }

    try {
      return await this.prisma.invoice.delete({ where: { id } });
    } catch (error) {
      console.error('Error removing invoice:', error);
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(`Invoice with ID "${id}" not found.`);
      }
      throw new InternalServerErrorException(`Could not delete invoice.`);
    }
  }


  /**
   * Cron job interne (NestJS Schedule) pour mettre à jour le statut des factures en OVERDUE
   * si la dueDate < aujourd'hui et que la facture n'est pas soldée.
   * Déclenché tous les jours à 00:01.
   * 
   * // TODO: Factoriser la stratégie pour pouvoir passer à un scheduler "pluggable" 
   *         (interne ou externe) selon la configuration/deploiement.
   */
  @Cron('1 0 * * *') // Minuit 01 chaque jour
  async markOverdueInvoices() {
    const today = new Date();
    try {
      // Met à jour tous les invoices non soldés, dont la date est passée, en OVERDUE
      const { count } = await this.prisma.invoice.updateMany({
        where: {
          dueDate: { lt: today },
          status: { in: ['PENDING', 'PARTIAL'] }, // Seulement ceux qui ne sont pas déjà payés ou overdue
        },
        data: {
          status: 'OVERDUE',
          updatedAt: new Date(),
        },
      });
      // TODO: notifier l'admin (organisation) et ajouter une alerte dashboard
      if (count > 0) {
        Logger.log(`[CRON] ${count} facture(s) passée(s) en statut "OVERDUE".`);
        console.log(`[CRON] ${count} facture(s) passée(s) en statut "OVERDUE".`);
        // TODO: Envoyer un email à l'administrateur concerné (organizationAdmin) 
        // et, si pertinent, au propriétaire individuel du bien lié à chaque facture.
        // TODO: Créer ou incrémenter une alerte/badge visible sur le dashboard de l'admin.
      }
      return count;
    } catch (error) {
      console.error('[CRON] Erreur lors de la mise à jour des factures OVERDUE:', error);
      throw new InternalServerErrorException('Erreur lors du cron de mise à jour des factures OVERDUE.');
    }
  }

  /**
   * Cron job interne pour générer les factures mensuelles le 1er de chaque mois à 00h01.
   * Pour chaque contrat actif sur le mois précédent, génère une facture si inexistante
   * ET uniquement si la période d'avance est écoulée (pas de facturation anticipée).
   * 
   * Exemple : le 1er Mai, génère la facture d'Avril.
   *
   * La logique suivante permet de :
   *  - Calculer pour chaque contrat la date réelle du début de paiement (startDate + advance)
   *  - NE générer la facture que si le mois précédent >= mois de début de paiement réel
   */
  @Cron('1 0 1 * *') // Tous les 1ers du mois à 00:01
  async generateMonthlyInvoices() {
    const today = new Date();

    // On émet la facture pour le MOIS PRÉCÉDENT à chaque début de mois
    const targetYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const targetMonth = today.getMonth() === 0 ? 12 : today.getMonth(); // 1-12 (1 = janvier,...)

    // Début et fin de la période du mois à facturer (ex: le 1 Mai => 1-30 Avril)
    const startOfPrevMonth = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endOfPrevMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    try {
      // 1. Récupère tous les contrats potentiellement concernés (actifs durant la période visée)
      const activeContracts = await this.prisma.contract.findMany({
        where: {
          startDate: { lte: endOfPrevMonth },
          OR: [
            { endDate: null },
            { endDate: { gte: startOfPrevMonth } },
          ],
          status: 'ACTIVE'
        },
        include: {
          tenant: true,
          property: true,
        },
      });

      let createdCount = 0;

      // 2. Boucle sur chaque contrat pour décider s'il doit être facturé
      for (const contract of activeContracts) {
        /**
         * Calcul de la première date à partir de laquelle on DOIT générer une facture (écoulement de l'avance) :
         * - Si contract.rentAdvance existant (>0), on décale le startDate d'autant de mois.
         * - Sinon, pas d'avance, la facturation commence au startDate.
         * 
         * Hypothèse: rentAdvance en mois (adapter si stocké différemment).
         */
        const advancePeriod = contract.rentAdvance || 0; // ex: 2 -> 2 mois d'avance payés
        const paymentStartDate = new Date(contract.startDate);
        paymentStartDate.setMonth(paymentStartDate.getMonth() + advancePeriod);

        // Pour le mois de facturation (mois précédent): doit être >= au premier mois payable
        // On compare YYYY-MM (mois à facturer >= mois paiement réel)
        if (
          endOfPrevMonth.getFullYear() < paymentStartDate.getFullYear() ||
          (endOfPrevMonth.getFullYear() === paymentStartDate.getFullYear() &&
            endOfPrevMonth.getMonth() < paymentStartDate.getMonth())
        ) {
          // Pas encore arrivé à la période payable -> ne rien générer pour ce contrat ce mois-ci
          // (On saute à la prochaine itération)
          continue;
        }

        // 3. Vérifie qu'une facture RENT n'existe pas déjà pour le contrat et la période courante (mois de paiement = mois en cours)
        // (On vérifie sur le mois courant car la dueDate de la facture à créer sera ce mois-ci - cf. logique existante)
        const startOfDueDateMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        const endOfDueDateMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

        const existingInvoice = await this.prisma.invoice.findFirst({
          where: {
            contractId: contract.id,
            type: InvoiceType.RENT,
            dueDate: {
              gte: startOfDueDateMonth,
              lte: endOfDueDateMonth,
            },
          },
        });

        if (existingInvoice) {
          // Une facture existe déjà pour ce mois -> skip (aucune création en double)
          continue;
        }

        // 4. Génère la facture pour le loyer du mois précédent
        await this.prisma.invoice.create({
          data: {
            invoiceNumber: makeInvoiceNumber('RENT'),
            contractId: contract.id,
            tenantId: contract.tenantId,
            amountDue: contract.rentAmount + (contract.chargesAmount || 0),
            paidAmount: 0,
            type: InvoiceType.RENT,
            status: InvoiceStatus.PENDING,
            // Echance de paiement : typiquement le 5 du mois, sauf si overridé par dayAddToPaymentDay
            dueDate: new Date(today.getFullYear(), today.getMonth(), contract.dayAddToPaymentDay || 5),
            organizationId: contract.organizationId,
          },
        });
        createdCount += 1;
      }

      if (createdCount > 0) {
        Logger.log(`[CRON] ${createdCount} facture(s) mensuelle(s) générée(s) pour le mois précédent.`);
        console.log(`[CRON] ${createdCount} facture(s) mensuelle(s) générée(s) pour le mois précédent.`);
      }
      return createdCount;
    } catch (error) {
      console.error('[CRON] Erreur lors de la génération des factures mensuelles:', error);
      throw new InternalServerErrorException('Erreur lors de la génération mensuelle des factures.');
    }
  }
}

/**
 * 
 * Plan de modification/correction


Historiser la date de la dernière génération réussie.
Au prochain lancement, générer les factures manquantes pour tous les mois non couverts depuis cette date.
Option : Ajouter déclenchement manuel par un endpoint sécurisé ou script CLI.
Flexibilité pour contrats atypiques

Supporter les contrats à fréquence non mensuelle (hebdomadaire, trimestrielle…).
Paramétrer la fréquence de génération par contrat.
Traitement des modifications de contrat

Vérifier les modifications éventuelles sur le montant/conditions du contrat avant génération de facture.
Ne pas dupliquer/générer si un changement rétroactif intervient.
Notifications et suivi

Ajouter l’envoi de notifications/alertes en cas d’échec ou d’incohérence.
Logger chaque opération de génération pour permettre un audit.
Optimisation

Regrouper/lister les contrats éligibles avant loop/traitement.
Minimiser le nombre de requêtes SQL.
Tests & validation

Ajouter des tests unitaires/cas pratiques pour tous les scénarios (avance, cron manqué, modification, fréquence…).


model InvoiceGenerationHistory {
  id             Int      @id @default(autoincrement())
  organizationId Int
  periodStart    DateTime
  periodEnd      DateTime
  status         String   // SUCCESS, FAILED
  details        String?  // log, erreur éventuelle
  generatedAt    DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id])
  @@map("invoice_generation_history")
}


*/