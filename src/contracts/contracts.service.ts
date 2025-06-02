import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import {
  Contract,
  ContractStatus,
  PropertyStatus,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/types'; // Adjust path

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createContractDto: CreateContractDto,
    user: JwtPayload,
  ): Promise<Contract> {
    // 1. Validate Existence of Related Entities
    const property = await this.prisma.property.findUnique({
      where: { id: createContractDto.propertyId },
    });
    if (!property)
      throw new NotFoundException(
        `Property with ID ${createContractDto.propertyId} not found.`,
      );

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: createContractDto.tenantId },
    });
    if (!tenant)
      throw new NotFoundException(
        `Tenant with ID ${createContractDto.tenantId} not found.`,
      );

    const manager = await this.prisma.employee.findUnique({
      where: { id: createContractDto.managerId },
    });
    if (!manager)
      throw new NotFoundException(
        `Manager (Employee) with ID ${createContractDto.managerId} not found.`,
      );

    // 2. Authorization Check (Admin or the assigned Manager of the property)
    const isAssignedManager = property.managerId === manager.id;
    if (
      user.role !== UserRole.ADMIN &&
      !(
        user.role === UserRole.EMPLOYEE &&
        manager.userId === user.sub &&
        isAssignedManager
      )
    ) {
      throw new ForbiddenException(
        'You must be an Admin or the assigned Manager of this property to create a contract.',
      );
    }
    // Ensure the managerId in DTO matches the property's manager or an Admin is doing it
    if (
      user.role !== UserRole.ADMIN &&
      property.managerId !== createContractDto.managerId
    ) {
      throw new ForbiddenException(
        'The managerId provided does not match the manager assigned to the property.',
      );
    }

    // 3. Business Logic Check (e.g., Is property available?)
    if (property.status !== PropertyStatus.AVAILABLE) {
      throw new ConflictException(
        `Property with ID <span class="math-inline">\{createContractDto\.propertyId\} is not currently available \(</span>{property.status}).`,
      );
    }

    try {
      // Transaction: Create contract and update property status
      const newContract = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: createContractDto,
          include: { property: true, tenant: true, manager: true },
        });
        // Update property status to RENTED
        await tx.property.update({
          where: { id: createContractDto.propertyId },
          data: { status: PropertyStatus.RENTED },
        });
        return created;
      });
      // TODO: Format response to exclude sensitive user data from nested relations if needed
      return newContract;
    } catch (error) {
      console.error('Error creating contract:', error);
      throw new InternalServerErrorException('Could not create contract.');
    }
  }

  async findAll(user: JwtPayload): Promise<Contract[]> {
    // Base query
    const queryArgs: any = {
      include: {
        property: true,
        tenant: { include: { user: true } },
        manager: { include: { user: true } },
      },
    };

    // Filter based on role
    if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (!ownerProfile) return []; // Owner profile not found
      queryArgs.where = { property: { ownerId: ownerProfile.id } };
    } else if (user.role === UserRole.TENANT) {
      const tenantProfile = await this.prisma.tenant.findUnique({
        where: { userId: user.sub },
      });
      if (!tenantProfile) return []; // Tenant profile not found
      queryArgs.where = { tenantId: tenantProfile.id };
    } else if (user.role === UserRole.EMPLOYEE) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });
      if (!employeeProfile) return []; // Employee profile not found
      // Show contracts they manage
      queryArgs.where = { managerId: employeeProfile.id };
    }
    // Admins see all (no specific where clause added)

    // TODO: Add pagination
    const contracts = await this.prisma.contract.findMany(queryArgs);
    // TODO: Format response to exclude sensitive user data from nested relations if needed
    return contracts;
  }

  async findOne(id: number, user: JwtPayload): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        property: { include: { owner: true } }, // Need owner info for check
        tenant: true,
        manager: true,
        payments: false, // Include if needed
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID "${id}" not found`);
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
      ownerProfile && contract.property.ownerId === ownerProfile.id;
    const isTenantOfContract =
      tenantProfile && contract.tenantId === tenantProfile.id;
    const isManagerOfContract =
      employeeProfile && contract.managerId === employeeProfile.id;

    if (
      user.role !== UserRole.ADMIN &&
      !isOwnerOfProperty &&
      !isTenantOfContract &&
      !isManagerOfContract
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this contract.',
      );
    }

    // TODO: Format response to exclude sensitive user data
    return contract;
  }

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    user: JwtPayload,
  ): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract)
      throw new NotFoundException(`Contract with ID "${id}" not found.`);

    // Authorization Check (Admin or Manager of the contract)
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      employeeProfile && contract.managerId === employeeProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the assigned Manager can update this contract.',
      );
    }

    try {
      const updatedContract = await this.prisma.contract.update({
        where: { id },
        data: updateContractDto,
        include: { property: true, tenant: true, manager: true },
      });
      // TODO: Handle property status update if contract status changes (e.g., TERMINATED -> AVAILABLE)
      // TODO: Format response
      return updatedContract;
    } catch (error) {
      console.error('Error updating contract:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Contract with ID "${id}" not found.`);
      throw new InternalServerErrorException('Could not update contract.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract)
      throw new NotFoundException(`Contract with ID "${id}" not found.`);

    // Authorization Check (Admin or Manager)
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const isManagerOfContract =
      employeeProfile && contract.managerId === employeeProfile.id;

    if (user.role !== UserRole.ADMIN && !isManagerOfContract) {
      throw new ForbiddenException(
        'Only Admins or the assigned Manager can delete this contract.',
      );
    }

    // Deleting contract cascades to Payments
    try {
      // Transaction: Delete contract and potentially update property status
      const deletedContract = await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.contract.delete({
          where: { id },
          include: { property: true }, // Include property to update its status
        });
        // If the property was RENTED, maybe set it back to AVAILABLE
        // Careful: Multiple contracts might exist for commercial properties? Check logic.
        if (deleted.property.status === PropertyStatus.RENTED) {
          // Check if any OTHER active contracts exist for this property
          const otherContracts = await tx.contract.count({
            where: {
              propertyId: deleted.propertyId,
              status: ContractStatus.ACTIVE,
            },
          });
          if (otherContracts === 0) {
            await tx.property.update({
              where: { id: deleted.propertyId },
              data: { status: PropertyStatus.AVAILABLE },
            });
          }
        }
        return deleted;
      });
      // TODO: Format response
      return deletedContract;
    } catch (error) {
      console.error('Error removing contract:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Contract with ID "${id}" not found.`);
      // Payments cascade, so no FK errors expected there
      throw new InternalServerErrorException(`Could not delete contract.`);
    }
  }
}
