import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestUser } from '../auth/types';
import { ContractsService } from './contracts.service';

describe('ContractsService access filters', () => {
  let service: ContractsService;
  let prisma: {
    contract: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    tenant: {
      findUnique: jest.Mock;
    };
  };

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
      contract: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    service = new ContractsService(prisma as any, {} as any, {} as any);
  });

  it('filters list by organization for admins', async () => {
    prisma.contract.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(service.findAll(adminUser)).resolves.toEqual([{ id: 1 }]);

    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 10 },
      }),
    );
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('filters list by tenant profile for tenants', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 55 });
    prisma.contract.findMany.mockResolvedValue([{ id: 1, tenantId: 55 }]);

    await expect(service.findAll(tenantUser)).resolves.toEqual([
      { id: 1, tenantId: 55 },
    ]);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { userId: 2 },
      select: { id: true },
    });
    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 10, tenantId: 55 },
      }),
    );
  });

  it('returns an empty list when a tenant has no tenant profile', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.findAll(tenantUser)).resolves.toEqual([]);

    expect(prisma.contract.findMany).not.toHaveBeenCalled();
  });

  it('does not expose another tenant contract detail', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 55 });
    prisma.contract.findFirst.mockResolvedValue(null);

    await expect(service.findOne(99, tenantUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 10, id: 99, tenantId: 55 },
      }),
    );
  });
});
