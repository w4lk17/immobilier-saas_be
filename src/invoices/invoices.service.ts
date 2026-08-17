import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus, InvoiceType, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/types';

function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  // function makeInvoiceNumber(periodDate: Date, prefix = 'INV'): string {
  //   const ymd = periodDate.toISOString().slice(0, 10).replaceAll('-', '');
    const rand = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `${prefix}-${ymd}-${Date.now()}-${rand}`;
  }

  @Injectable()
  export class InvoicesService implements OnModuleInit {
    constructor(private prisma: PrismaService) { }


    /**
     * Méthode d'initialisation du module.
     * À chaque démarrage de l'application, vérifie si la génération des factures mensuelles
     * (pour la période du mois précédent) a déjà été effectuée pour chaque organisation.
     * Si aucune trace de génération "SUCCESS" pour la période courante n'est trouvée,
     * lance le cron de génération pour toutes les organisations.
     */
    async onModuleInit() {
      const today = new Date();
      const currentPeriodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const currentPeriodEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      // Vérifie pour chaque org si la génération de ce mois a déjà eu lieu
      const organizations = await this.prisma.organization.findMany();
      for (const org of organizations) {
        const exists = await this.prisma.invoiceGenerationHistory.findFirst({
          where: {
            organizationId: org.id,
            periodStart: currentPeriodStart,
            periodEnd: currentPeriodEnd,
            status: 'SUCCESS',
          },
        });
        if (!exists) {
          await this.generateMonthlyInvoices();
          break; // Une seule exécution suffit si globale pour toutes les orgs
        }
      }
    }

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
     * Format : minute heure jour-mois mois jour-semaine
     * Exemple : le 1er Mai, génère la facture d'Avril.
     *
     * La logique suivante permet de :
     *  - Calculer pour chaque contrat la date réelle du début de paiement (startDate + advance)
     *  - NE générer la facture que si le mois précédent >= mois de début de paiement réel
     */
    @Cron('1 0 1 * *') // Tous les 1ers du mois à 00:01
    async generateMonthlyInvoices() {
      const today = new Date();

      // Historique d'exécution de génération (par organisation/période)
      // 1. Récupère la dernière période générée pour CHAQUE ORGANISATION
      const organizations = await this.prisma.organization.findMany();

      let globalCreatedCount = 0;
      const historyResults: any[] = [];

      for (const org of organizations) {
        let latestHistory = await this.prisma.invoiceGenerationHistory.findFirst({
          where: { organizationId: org.id, status: "SUCCESS" },
          orderBy: { periodEnd: "desc" },
        });

        // Si aucun historique, on démarre à la date du plus vieux contrat actif
        let startDate: Date;
        if (!latestHistory) {
          const oldestContract = await this.prisma.contract.findFirst({
            where: { organizationId: org.id, status: 'ACTIVE' },
            orderBy: { startDate: 'asc' },
          });
          if (!oldestContract) continue; // Pas de contrat, rien à générer
          // On commence à son mois de démarrage
          startDate = new Date(oldestContract.startDate);
          startDate.setDate(1); // Début de mois

        } else {
          // Mois suivant la dernière génération réussie
          startDate = new Date(latestHistory.periodEnd);
          startDate.setDate(1);
          startDate.setMonth(startDate.getMonth() + 1);

        }

        // La période max qu'on peut traiter : MOIS PRÉCÉDENT
        const targetYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
        const targetMonth = today.getMonth() === 0 ? 12 : today.getMonth(); // 1-12
        const lastMonthToCover = new Date(targetYear, targetMonth - 1, 1);

        // Liste des périodes à traiter => générer pour tous les mois manqués jusqu'au mois précédent
        let periods: { periodStart: Date; periodEnd: Date }[] = [];
        let cursor = new Date(startDate);

        while (
          cursor.getFullYear() < lastMonthToCover.getFullYear() ||
          (cursor.getFullYear() === lastMonthToCover.getFullYear() && cursor.getMonth() <= lastMonthToCover.getMonth())
        ) {
          const periodStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
          const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
          periods.push({ periodStart, periodEnd });
          cursor.setMonth(cursor.getMonth() + 1);

        }

        for (const { periodStart, periodEnd } of periods) {
          let createdCount = 0;
          let periodStatus = 'SUCCESS';
          let periodDetails = '';
          try {
            // Contrats actifs durant la période
            const activeContracts = await this.prisma.contract.findMany({
              where: {
                organizationId: org.id,
                startDate: { lte: periodEnd },
                OR: [
                  { endDate: null },
                  { endDate: { gte: periodStart } },
                ],
                status: 'ACTIVE'
              },
              include: {
                tenant: true,
                property: true,

              },

            });

            // Boucle sur chaque contrat
            for (const contract of activeContracts) {
              // 1. Calcul date réelle de début de facturation (avance)
              const advancePeriod = contract.rentAdvance || 0;
              const paymentStartDate = new Date(contract.startDate);
              paymentStartDate.setMonth(paymentStartDate.getMonth() + advancePeriod);

              // NE FACTURE que si (fin de période >= paiement réel)
              if (
                periodEnd.getFullYear() < paymentStartDate.getFullYear() ||
                (periodEnd.getFullYear() === paymentStartDate.getFullYear() &&
                  periodEnd.getMonth() < paymentStartDate.getMonth())
              ) {
                continue;

              }

              // 2. Facture déjà existante pour cette période & contrat ??
              //   -> Une facture RENT avec dueDate dans le mois suivant la période à facturer !
              const dueStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1, 0, 0, 0, 0);
              const dueEnd = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 2, 0, 23, 59, 59, 999);

              const existingInvoice = await this.prisma.invoice.findFirst({
                where: {
                  contractId: contract.id,
                  type: InvoiceType.RENT,
                  dueDate: {
                    gte: dueStart,
                    lte: dueEnd,
                  },
                },
              });

              if (existingInvoice) continue;

              // 3. Générer la facture
              await this.prisma.invoice.create({
                data: {
                  invoiceNumber: makeInvoiceNumber('RENT'),
                  contractId: contract.id,
                  tenantId: contract.tenantId,
                  amountDue: contract.rentAmount + (contract.chargesAmount || 0),
                  paidAmount: 0,
                  type: InvoiceType.RENT,
                  status: InvoiceStatus.PENDING,
                  // Due = 5 du mois suivant, sauf override par dayAddToPaymentDay
                  dueDate: new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, contract.dayAddToPaymentDay || 5),
                  organizationId: contract.organizationId,
                },
              });
              createdCount += 1;
            }
            // Historiser la génération
            await this.prisma.invoiceGenerationHistory.create({
              data: {
                organizationId: org.id,
                periodStart,
                periodEnd,
                status: periodStatus,
                details: `Factures générées: ${createdCount}`,
              },
            });

            if (createdCount > 0) {
              Logger.log(`[CRON][ORG ${org.id}] ${createdCount} facture(s) créées pour période ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`);

            }
          } catch (error) {
            periodStatus = 'FAILED';
            let errorMsg: string;
            if (error instanceof Error) {
              errorMsg = error.message;
            } else {
              errorMsg = `${error}`;
            }
            periodDetails = `Erreur: ${errorMsg}`;
            await this.prisma.invoiceGenerationHistory.create({
              data: {
                organizationId: org.id,
                periodStart,
                periodEnd,
                status: periodStatus,
                details: periodDetails,
              },
            });
            Logger.error(`[CRON][ORG ${org.id}] Erreur génération factures: période ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()} =>`, error);
          }
          globalCreatedCount += createdCount;
          historyResults.push({
            orgId: org.id,
            periodStart,
            periodEnd,
            createdCount,
            status: periodStatus,
            details: periodDetails,
          });
        }
      }

      // Log général pour audit
      Logger.log(`[CRON] Génération factures mensuelles terminée. Factures créées: ${globalCreatedCount}`);
      return { created: globalCreatedCount, history: historyResults };
    }

    @Cron('0 3 1 * *') // Chaque 1er du mois à 03:00
    async purgeOldInvoiceGenerationHistory() {
      const cutoffDate = new Date();
      const retentionYears = Number(process.env.INVOICE_HISTORY_RETENTION_YEARS) || 2;
      cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);
      const { count } = await this.prisma.invoiceGenerationHistory.deleteMany({
        where: { periodEnd: { lt: cutoffDate } },
      });
      Logger.log(`[CRON] Purge historique facture : ${count} lignes effacées (avant ${cutoffDate.toLocaleDateString()})`);
    }
  }
