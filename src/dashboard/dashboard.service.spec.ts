import { InvoiceStatus, InvoiceType, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/types';
import { DashboardService } from './dashboard.service';

describe('DashboardService access scopes', () => {
  let service: DashboardService;
  let prisma: any;

  const adminUser: RequestUser = {
    id: 1,
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
    organizationId: 10,
  };

  const tenantUser: RequestUser = {
    id: 2,
    email: 'tenant@example.com',
    role: UserRole.TENANT,
    isActive: true,
    organizationId: 10,
  };

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(0) },
      manager: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() },
      property: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      contract: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { paidAmount: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: { findUnique: jest.fn() },
      owner: { findUnique: jest.fn() },
    };

    service = new DashboardService(prisma);
  });

  it('scopes admin dashboard to the current organization', async () => {
    await service.getAdminDashboard(adminUser);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { organizationId: 10, role: UserRole.TENANT },
    });
    expect(prisma.property.count).toHaveBeenCalledWith({
      where: { organizationId: 10 },
    });
    expect(prisma.invoice.count).toHaveBeenCalledWith({
      where: {
        organizationId: 10,
        type: InvoiceType.RENT,
        status: {
          in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
        },
      },
    });
  });

  it('scopes tenant dashboard to the current tenant profile', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 55 });
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);

    await service.getTenantDashboard(tenantUser);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { userId: 2 },
      select: { id: true },
    });
    expect(prisma.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 10,
          tenantId: 55,
        }),
      }),
    );
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 10,
          tenantId: 55,
          type: InvoiceType.RENT,
        }),
      }),
    );
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 10,
          tenantId: 55,
          type: InvoiceType.RENT,
          status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
        }),
      }),
    );
    expect(prisma.invoice.count).toHaveBeenCalledWith({
      where: {
        organizationId: 10,
        tenantId: 55,
        type: InvoiceType.RENT,
        status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
      },
    });
  });

  it('keeps revenue filters and adds rent invoice type', async () => {
    await service.getAdminDashboard(adminUser);

    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 10,
        type: InvoiceType.RENT,
        paidDate: expect.any(Object),
      }),
      _sum: { paidAmount: true },
    });
  });
});
