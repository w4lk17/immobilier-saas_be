import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createPropertyDto: CreatePropertyDto,
    user: JwtPayload,
  ): Promise<Property> {
    // Validate Owner exists
    const owner = await this.prisma.owner.findUnique({
      where: { id: createPropertyDto.ownerId },
    });
    if (!owner)
      throw new NotFoundException(
        `Owner with ID "${createPropertyDto.ownerId}" not found.`,
      );

    // RBAC Check: Ensure only ADMIN or the correct OWNER can create
    if (user.role !== UserRole.ADMIN && owner.userId !== user.sub) {
      throw new ForbiddenException(
        `You do not have permission to create a property for owner ID ${createPropertyDto.ownerId}.`,
      );
    }

    // Validate Manager exists if provided
    if (createPropertyDto.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: createPropertyDto.managerId },
      });
      if (!manager)
        throw new NotFoundException(
          `Manager (Employee) with ID "${createPropertyDto.managerId}" not found.`,
        );
    }

    try {
      return await this.prisma.property.create({
        data: createPropertyDto,
        include: { owner: true, manager: true },
      });
    } catch (error) {
      console.error('Error creating property:', error);
      throw new InternalServerErrorException('Could not create property.');
    }
  }

  async findAll(): Promise<Property[]> {
    // Add filtering/pagination later if needed
    return this.prisma.property.findMany({
      include: {
        owner: { include: { user: true } },
        manager: { include: { user: true } },
        contracts: false,
        expenses: false,
      },
      // Note: Including nested user data might require formatting to remove sensitive fields
    });
  }

  async findOne(id: number): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { owner: true, manager: true, contracts: true, expenses: true }, // Include details
    });
    if (!property) {
      throw new NotFoundException(`Property with ID "${id}" not found`);
    }
    // Add formatting if nested sensitive user data is included
    return property;
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    user: JwtPayload,
  ): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property)
      throw new NotFoundException(`Property with ID "${id}" not found.`);

    // RBAC Check: Admin, Owner, or assigned Manager
    const isOwner =
      user.role === UserRole.OWNER &&
      property.ownerId ===
        (await this.prisma.owner.findUnique({ where: { userId: user.sub } }))
          ?.id;
    const isManager =
      user.role === UserRole.EMPLOYEE &&
      property.managerId ===
        (await this.prisma.employee.findUnique({ where: { userId: user.sub } }))
          ?.id;

    if (user.role !== UserRole.ADMIN && !isOwner && !isManager) {
      throw new ForbiddenException(
        `You do not have permission to update property ID ${id}.`,
      );
    }

    // Validate new owner/manager IDs if they are changed
    if (
      updatePropertyDto.ownerId &&
      updatePropertyDto.ownerId !== property.ownerId
    ) {
      if (user.role !== UserRole.ADMIN)
        throw new ForbiddenException(`Only Admins can change the owner.`);
      const ownerExists = await this.prisma.owner.findUnique({
        where: { id: updatePropertyDto.ownerId },
      });
      if (!ownerExists)
        throw new NotFoundException(
          `New owner with ID "${updatePropertyDto.ownerId}" not found.`,
        );
    }
    if (
      updatePropertyDto.managerId &&
      updatePropertyDto.managerId !== property.managerId
    ) {
      const managerExists = await this.prisma.employee.findUnique({
        where: { id: updatePropertyDto.managerId },
      });
      if (!managerExists)
        throw new NotFoundException(
          `New manager with ID "${updatePropertyDto.managerId}" not found.`,
        );
    } else if (
      updatePropertyDto.managerId === null &&
      property.managerId !== null
    ) {
      // Allowing removal of manager
    }

    try {
      return await this.prisma.property.update({
        where: { id },
        data: updatePropertyDto,
        include: { owner: true, manager: true },
      });
    } catch (error) {
      console.error('Error updating property:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Property with ID "${id}" not found.`);
      throw new InternalServerErrorException('Could not update property.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property)
      throw new NotFoundException(`Property with ID "${id}" not found.`);

    // RBAC Check: Admin or Owner
    const isOwner =
      user.role === UserRole.OWNER &&
      property.ownerId ===
        (await this.prisma.owner.findUnique({ where: { userId: user.sub } }))
          ?.id;

    if (user.role !== UserRole.ADMIN && !isOwner) {
      throw new ForbiddenException(
        `You do not have permission to delete property ID ${id}.`,
      );
    }
    // Deleting property cascades to Contracts and Expenses
    try {
      return await this.prisma.property.delete({ where: { id } });
    } catch (error) {
      console.error('Error removing property:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Property with ID "${id}" not found.`);
      // Foreign key errors shouldn't happen due to onDelete: Cascade
      throw new InternalServerErrorException(`Could not delete property.`);
    }
  }
}
