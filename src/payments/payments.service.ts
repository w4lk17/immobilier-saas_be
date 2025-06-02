import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment, UserRole, PaymentStatus } from '@prisma/client';
import { JwtPayload } from '../auth/types';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createPaymentDto: CreatePaymentDto,
    user: JwtPayload,
  ): Promise<Payment> {
    // 1. Validate Contract and Tenant existence
    const contract = await this.prisma.contract.findUnique({
      where: { id: createPaymentDto.contractId },
      include: { manager: true }, // Need manager info
    });
    if (!contract)
      throw new NotFoundException(
        `Contract with ID ${createPaymentDto.contractId} not found.`,
      );

    // Ensure tenant ID matches the contract's tenant ID
    if (contract.tenantId !== createPaymentDto.tenantId) {
      throw new ConflictException(
        `Tenant ID ${createPaymentDto.tenantId} does not match the tenant on contract ID ${createPaymentDto.contractId}.`,
      );
    }

    // 2. Authorization Check (Admin or Manager of the contract)
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      employeeProfile && contract.managerId === employeeProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can create payments.',
      );
    }

    try {
      return await this.prisma.payment.create({
        data: createPaymentDto,
        include: { contract: true, tenant: true },
      });
    } catch (error) {
      console.error('Error creating payment:', error);
      throw new InternalServerErrorException('Could not create payment.');
    }
  }

  async findAll(user: JwtPayload): Promise<Payment[]> {
    const queryArgs: any = {
      include: {
        contract: { include: { property: true } },
        tenant: { include: { user: true } },
      },
    };

    // Filter based on role
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
      // Find payments linked to contracts linked to properties owned by this user
      queryArgs.where = {
        contract: { property: { ownerId: ownerProfile.id } },
      };
    } else if (user.role === UserRole.EMPLOYEE) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });
      if (!employeeProfile) return [];
      // Find payments linked to contracts managed by this user
      queryArgs.where = { contract: { managerId: employeeProfile.id } };
    }
    // Admins see all

    // TODO: Pagination
    const payments = await this.prisma.payment.findMany(queryArgs);
    // TODO: Format responses if needed
    return payments;
  }

  async findOne(id: number, user: JwtPayload): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        contract: {
          include: { property: { include: { owner: true } }, manager: true },
        },
        tenant: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${id}" not found`);
    }

    // Authorization Check
    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.sub } })
        : null;
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.sub } })
        : null;
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;

    const isOwnerOfProperty =
      ownerProfile && payment.contract.property.ownerId === ownerProfile.id;
    const isTenantOfPayment =
      tenantProfile && payment.tenantId === tenantProfile.id;
    const isManagerOfContract =
      employeeProfile && payment.contract.managerId === employeeProfile.id;

    if (
      user.role !== UserRole.ADMIN &&
      !isOwnerOfProperty &&
      !isTenantOfPayment &&
      !isManagerOfContract
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this payment.',
      );
    }

    // TODO: Format response
    return payment;
  }

  async update(
    id: number,
    updatePaymentDto: UpdatePaymentDto,
    user: JwtPayload,
  ): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { contract: true, tenant: true },
    });
    if (!payment)
      throw new NotFoundException(`Payment with ID "${id}" not found.`);

    // Authorization: Who can update?
    // Option 1: Only Admin or Manager can update status/paidDate
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      employeeProfile && payment.contract.managerId === employeeProfile.id;

    // Option 2: Allow Tenant to mark as PAID? (Requires careful consideration)
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.sub } })
        : null;
    const isTenantOfPayment =
      tenantProfile && payment.tenantId === tenantProfile.id;

    // Allow Admin or Manager to update anything in the DTO
    // Allow Tenant ONLY to change status to PAID if it's currently PENDING/LATE
    let canUpdate = false;
    if (user.role === UserRole.ADMIN || isManagerOfContract) {
      canUpdate = true;
    } else if (
      isTenantOfPayment &&
      updatePaymentDto.status === PaymentStatus.PAID &&
      (payment.status === PaymentStatus.PENDING ||
        payment.status === PaymentStatus.LATE) &&
      Object.keys(updatePaymentDto).length ===
        (updatePaymentDto.paidDate ? 2 : 1) // Only allow status and optional paidDate update by tenant
    ) {
      canUpdate = true;
      // Automatically set paidDate if tenant marks as paid and date isn't provided
      if (!updatePaymentDto.paidDate) {
        updatePaymentDto.paidDate = new Date();
      }
    }

    if (!canUpdate) {
      throw new ForbiddenException(
        'You do not have permission to update this payment in the requested way.',
      );
    }

    try {
      return await this.prisma.payment.update({
        where: { id },
        data: updatePaymentDto,
        include: { contract: true, tenant: true },
      });
    } catch (error) {
      console.error('Error updating payment:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Payment with ID "${id}" not found.`);
      throw new InternalServerErrorException('Could not update payment.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { contract: true },
    });
    if (!payment)
      throw new NotFoundException(`Payment with ID "${id}" not found.`);

    // Authorization Check (Admin or Manager of the contract)
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      employeeProfile && payment.contract.managerId === employeeProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the Manager of the associated contract can delete payments.',
      );
    }

    try {
      return await this.prisma.payment.delete({ where: { id } });
    } catch (error) {
      console.error('Error removing payment:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Payment with ID "${id}" not found.`);
      throw new InternalServerErrorException(`Could not delete payment.`);
    }
  }
}
