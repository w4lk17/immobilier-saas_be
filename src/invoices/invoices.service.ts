import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';

function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ymd}-${Date.now()}-${rand}`;
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createInvoiceDto: CreateInvoiceDto,
    user: JwtPayload,
  ): Promise<Invoice> {
    // 1. Validate Contract existence
    const contract = await this.prisma.contract.findUnique({
      where: { id: createInvoiceDto.contractId },
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
        ? await this.prisma.manager.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      managerProfile && contract.managerId === managerProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can create invoices.',
      );
    }

    const invoiceNumber = createInvoiceDto.invoiceNumber || makeInvoiceNumber();

    try {
      return await this.prisma.invoice.create({
        data: {
          ...createInvoiceDto,
          invoiceNumber,
        },
        include: { contract: true, tenant: { include: { user: true } } },
      });
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw new InternalServerErrorException('Could not create invoice.');
    }
  }

  async findAll(user: JwtPayload): Promise<Invoice[]> {
    const queryArgs: any = {
      include: {
        contract: { include: { property: true } },
        tenant: { include: { user: true } },
        transactions: true,
      },
      orderBy: { dueDate: 'desc' },
    };

    if (user.role === UserRole.TENANT) {
      const tenantProfile = await this.prisma.tenant.findUnique({
        where: { userId: user.sub },
      });
      if (!tenantProfile) return [];
      queryArgs.where = { tenantId: tenantProfile.id };
    } else if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (!ownerProfile) return [];
      queryArgs.where = {
        contract: { property: { ownerId: ownerProfile.id } },
      };
    } else if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (!managerProfile) return [];
      queryArgs.where = { contract: { managerId: managerProfile.id } };
    }

    return this.prisma.invoice.findMany(queryArgs);
  }

  async findOne(id: number, user: JwtPayload): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        contract: {
          include: { property: { include: { owner: true } }, manager: true },
        },
        tenant: { include: { user: true } },
        transactions: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    // Authorization
    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.sub } })
        : null;
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.sub } })
        : null;
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.sub } })
        : null;

    const isOwnerOfProperty =
      ownerProfile && invoice.contract.property.ownerId === ownerProfile.id;
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
    user: JwtPayload,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { contract: true, tenant: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found.`);
    }

    // Authorization (Admin or Manager of the contract)
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.sub } })
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
      if (error.code === 'P2025') {
        throw new NotFoundException(`Invoice with ID "${id}" not found.`);
      }
      throw new InternalServerErrorException('Could not update invoice.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { contract: true, transactions: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found.`);
    }

    // Authorization (Admin or Manager of the contract)
    const managerProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.manager.findUnique({ where: { userId: user.sub } })
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
      if (error.code === 'P2025') {
        throw new NotFoundException(`Invoice with ID "${id}" not found.`);
      }
      throw new InternalServerErrorException(`Could not delete invoice.`);
    }
  }
}
