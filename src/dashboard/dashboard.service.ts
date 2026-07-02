import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContractStatus,
  InvoiceStatus,
  InvoiceType,
  PropertyStatus,
  RentalStatus,
  UserRole,
} from '@prisma/client';
import { RequestUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardActivity } from './dashboard.types';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) { }

  async getAdminDashboard(user: RequestUser) {
    const { monthStart, monthEnd } = this.getMonthRange();
    const organizationId = user.organizationId;

    const [
      totalTenants,
      activeTenants,
      totalManagers,
      totalProperties,
      totalContracts,
      activeContracts,
      monthlyRevenue,
      pendingInvoices,
      recentInvoices,
      recentContracts,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId, role: UserRole.TENANT },
      }),
      this.prisma.user.count({
        where: { organizationId, role: UserRole.TENANT, isActive: true },
      }),
      this.prisma.manager.count({
        where: { user: { organizationId } },
      }),
      this.prisma.property.count({ where: { organizationId } }),
      this.prisma.contract.count({ where: { organizationId } }),
      this.prisma.contract.count({
        where: { organizationId, status: ContractStatus.ACTIVE },
      }),
      this.sumInvoicePaidAmount({
        organizationId,
        paidDate: { gte: monthStart, lt: monthEnd },
      }),
      // this.sumInvoiceUnpaidAmount({
      //   organizationId,
      //   paidDate: { gte: monthStart, lt: monthEnd },
      // }),
      this.prisma.invoice.count({
        where: {
          organizationId,
          type: InvoiceType.RENT,
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
        },
      }),
      this.findRecentInvoices({ organizationId, type: InvoiceType.RENT }),
      this.findRecentContracts({ organizationId }),
    ]);

    return {
      totalTenants,
      activeTenants,
      totalManagers,
      totalProperties,
      totalContracts,
      activeContracts,
      monthlyRevenue,
      pendingInvoices,
      recentInvoices,
      recentActivity: this.buildRecentActivity(recentInvoices, recentContracts),
    };
  }

  async getManagerDashboard(user: RequestUser) {
    const manager = await this.prisma.manager.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!manager) return this.emptyManagerDashboard();

    const { monthStart, monthEnd } = this.getMonthRange();
    const organizationId = user.organizationId;
    const propertyWhere = { organizationId, managerId: manager.id };
    const contractWhere: any = {
      organizationId,
      OR: [{ managerId: manager.id }, { property: { managerId: manager.id } }],
    };
    const invoiceWhere: any = {
      organizationId,
      contract: {
        OR: [{ managerId: manager.id }, { property: { managerId: manager.id } }],
      },
    };

    const [
      totalProperties,
      occupiedProperties,
      vacantProperties,
      totalContracts,
      activeContracts,
      tenantRows,
      monthlyRevenue,
      monthlyExpenses,
      pendingInvoices,
      recentInvoices,
      recentExpenses,
    ] = await Promise.all([
      this.prisma.property.count({ where: propertyWhere }),
      this.prisma.property.count({
        where: { ...propertyWhere, rentals: { some: { status: RentalStatus.OCCUPIED } } },
      }),
      this.prisma.property.count({
        where: { ...propertyWhere, status: { in: [PropertyStatus.AVAILABLE, PropertyStatus.FOR_RENT] } },
      }),
      this.prisma.contract.count({ where: contractWhere }),
      this.prisma.contract.count({
        where: { ...contractWhere, status: ContractStatus.ACTIVE },
      }),
      this.prisma.contract.findMany({
        where: contractWhere,
        distinct: ['tenantId'],
        select: { tenantId: true },
      }),
      this.sumInvoicePaidAmount({
        ...invoiceWhere,
        paidDate: { gte: monthStart, lt: monthEnd },
      }),
      this.sumExpenseAmount({
        organizationId,
        property: { managerId: manager.id },
        date: { gte: monthStart, lt: monthEnd },
      }),
      this.prisma.invoice.count({
        where: {
          ...invoiceWhere,
          type: InvoiceType.RENT,
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
        },
      }),
      this.findRecentInvoices({ ...invoiceWhere, type: InvoiceType.RENT }),
      this.findRecentExpenses({ organizationId, property: { managerId: manager.id } }),
    ]);

    return {
      totalProperties,
      occupiedProperties,
      vacantProperties,
      totalContracts,
      activeContracts,
      totalTenants: tenantRows.length,
      monthlyRevenue,
      monthlyExpenses,
      pendingInvoices,
      recentInvoices,
      recentExpenses,
    };
  }

  async getOwnerDashboard(user: RequestUser) {
    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) return this.emptyOwnerDashboard();

    const { monthStart, monthEnd, yearStart, yearEnd } = this.getDateRanges();
    const organizationId = user.organizationId;
    const propertyWhere = { organizationId, ownerId: owner.id };
    const contractWhere = { organizationId, ownerId: owner.id };
    const invoiceWhere = { organizationId, contract: { ownerId: owner.id } };

    const [
      totalProperties,
      occupiedProperties,
      vacantProperties,
      monthlyRevenue,
      annualRevenue,
      activeContracts,
      tenantRows,
      recentPayments,
      recentExpenses,
      propertySummary,
    ] = await Promise.all([
      this.prisma.property.count({ where: propertyWhere }),
      this.prisma.property.count({
        where: { ...propertyWhere, rentals: { some: { status: RentalStatus.OCCUPIED } } },
      }),
      this.prisma.property.count({
        where: { ...propertyWhere, status: { in: [PropertyStatus.AVAILABLE, PropertyStatus.FOR_RENT] } },
      }),
      this.sumInvoicePaidAmount({
        ...invoiceWhere,
        paidDate: { gte: monthStart, lt: monthEnd },
      }),
      this.sumInvoicePaidAmount({
        ...invoiceWhere,
        paidDate: { gte: yearStart, lt: yearEnd },
      }),
      this.prisma.contract.count({
        where: { ...contractWhere, status: ContractStatus.ACTIVE },
      }),
      this.prisma.contract.findMany({
        where: contractWhere,
        distinct: ['tenantId'],
        select: { tenantId: true },
      }),
      this.findRecentInvoices({
        ...invoiceWhere,
        type: InvoiceType.RENT,
        status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
      }),
      this.findRecentExpenses({ organizationId, property: { ownerId: owner.id } }),
      this.prisma.property.findMany({
        where: propertyWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          rentals: { select: { id: true, status: true, rentalValue: true } },
          contracts: {
            where: { status: ContractStatus.ACTIVE },
            take: 1,
            include: { tenant: { include: { user: true } } },
          },
        },
      }),
    ]);

    return {
      monthlyRevenue,
      annualRevenue,
      totalProperties,
      occupiedProperties,
      vacantProperties,
      occupancyRate: totalProperties ? Math.round((occupiedProperties / totalProperties) * 100) : 0,
      activeTenants: tenantRows.length,
      activeContracts,
      recentPayments,
      recentExpenses,
      propertySummary,
    };
  }

  async getTenantDashboard(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!tenant) return this.emptyTenantDashboard();

    const organizationId = user.organizationId;
    const activeContract = await this.prisma.contract.findFirst({
      where: {
        organizationId,
        tenantId: tenant.id,
        status: ContractStatus.ACTIVE,
      },
      orderBy: { startDate: 'desc' },
      include: {
        owner: { include: { user: true } },
        property: true,
        rental: true,
      },
    });

    const [nextInvoice, recentPayments, receiptCount] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: {
          organizationId,
          tenantId: tenant.id,
          type: InvoiceType.RENT,
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
        },
        orderBy: { dueDate: 'asc' },
        include: { contract: true },
      }),
      this.findRecentInvoices({
        organizationId,
        tenantId: tenant.id,
        type: InvoiceType.RENT,
        status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
      }),
      this.prisma.invoice.count({
        where: {
          organizationId,
          tenantId: tenant.id,
          type: InvoiceType.RENT,
          status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
        },
      }),
    ]);

    return {
      monthlyRent: activeContract
        // ? activeContract.rentAmount + activeContract.chargesAmount
        ? activeContract.rentAmount
        : 0,
      currentMonthRentDue: activeContract
        ? activeContract.rentAmount + activeContract.chargesAmount
        : 0,
      nextInvoice,
      nextRentInvoice: nextInvoice,
      daysRemaining: nextInvoice ? this.daysUntil(nextInvoice.dueDate) : null,
      paymentStatus: nextInvoice?.status ?? null,
      activeContract,
      currentHousing: activeContract
        ? {
          title: activeContract.designation,
          address: activeContract.address,
          owner: {
            name: `${activeContract.owner.user.civility} ${activeContract.owner.user.lastName} ${activeContract.owner.user.firstName}`,
            phone: activeContract.owner.user.phoneNumber,
          },
          leaseStatus: activeContract.status,
          leaseStart: activeContract.startDate,
          leaseEnd: activeContract.endDate ? activeContract.endDate : null
        }
        : null,
      recentPayments,
      documentSummary: {
        contract: activeContract?.pdfUrl ? 1 : 0,
        receipts: receiptCount,
        insurance: 0,
      },
      maintenanceSummary: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      unreadMessages: 0,
    };
  }

  private async sumInvoicePaidAmount(where: any): Promise<number> {
    const result = await this.prisma.invoice.aggregate({
      where: { ...where, type: InvoiceType.RENT },
      _sum: { paidAmount: true },
    });
    return result._sum.paidAmount ?? 0;
  }

  private async sumExpenseAmount(where: any): Promise<number> {
    const result = await this.prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  private findRecentInvoices(where: any) {
    return this.prisma.invoice.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { include: { user: true } },
        contract: { include: { property: true, owner: { include: { user: true } } } },
      },
    });
  }

  private findRecentContracts(where: any) {
    return this.prisma.contract.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { include: { user: true } },
        owner: { include: { user: true } },
      },
    });
  }

  private findRecentExpenses(where: any) {
    return this.prisma.expense.findMany({
      where,
      take: 5,
      orderBy: { date: 'desc' },
      include: {
        property: true,
        rental: true,
        recordedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  private buildRecentActivity(
    invoices: Array<any>,
    contracts: Array<any>,
  ): DashboardActivity[] {
    const invoiceActivities = invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      action: `Facture ${invoice.status.toLowerCase()}`,
      user: invoice.tenant?.user
        ? `${invoice.tenant.user.lastName} ${invoice.tenant.user.firstName}`
        : undefined,
      type:
        invoice.status === InvoiceStatus.PAID
          ? ('success' as const)
          : invoice.status === InvoiceStatus.OVERDUE
            ? ('warning' as const)
            : ('info' as const),
      occurredAt: invoice.createdAt,
    }));

    const contractActivities = contracts.map((contract) => ({
      id: `contract-${contract.id}`,
      action: `Contrat ${contract.status.toLowerCase()}`,
      user: contract.tenant?.user
        ? `${contract.tenant.user.lastName} ${contract.tenant.user.firstName}`
        : undefined,
      type:
        contract.status === ContractStatus.ACTIVE
          ? ('success' as const)
          : ('info' as const),
      occurredAt: contract.createdAt,
    }));

    return [...invoiceActivities, ...contractActivities]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 5);
  }

  private getDateRanges() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 6);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 6);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    return { monthStart, monthEnd, yearStart, yearEnd };
  }

  private getMonthRange() {
    const { monthStart, monthEnd } = this.getDateRanges();
    return { monthStart, monthEnd };
  }

  private daysUntil(date: Date) {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.ceil((target.getTime() - startOfToday.getTime()) / 86_400_000);
  }

  private emptyManagerDashboard() {
    return {
      totalProperties: 0,
      occupiedProperties: 0,
      vacantProperties: 0,
      totalContracts: 0,
      activeContracts: 0,
      totalTenants: 0,
      monthlyRevenue: 0,
      monthlyExpenses: 0,
      pendingInvoices: 0,
      recentInvoices: [],
      recentExpenses: [],
    };
  }

  private emptyOwnerDashboard() {
    return {
      monthlyRevenue: 0,
      annualRevenue: 0,
      totalProperties: 0,
      occupiedProperties: 0,
      vacantProperties: 0,
      occupancyRate: 0,
      activeTenants: 0,
      activeContracts: 0,
      recentPayments: [],
      recentExpenses: [],
      propertySummary: [],
    };
  }

  private emptyTenantDashboard() {
    return {
      monthlyRent: 0,
      currentMonthRentDue: 0,
      nextInvoice: null,
      nextRentInvoice: null,
      daysRemaining: null,
      paymentStatus: null,
      activeContract: null,
      currentHousing: null,
      recentPayments: [],
      documentSummary: { contract: 0, receipts: 0, insurance: 0 },
      maintenanceSummary: { total: 0, pending: 0, inProgress: 0, completed: 0 },
      unreadMessages: 0,
    };
  }
}
