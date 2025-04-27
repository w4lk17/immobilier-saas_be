import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { Owner, UserRole } from '@prisma/client';

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService) {}

  // Helper to exclude sensitive User data
  private formatOwnerResponse(owner: Owner & { user?: any }): any {
    if (owner.user) {
      const { password, hashedRefreshToken, ...secureUser } = owner.user;
      return { ...owner, user: secureUser };
    }
    return owner;
  }

  async create(createOwnerDto: CreateOwnerDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: createOwnerDto.userId },
    });
    if (!user)
      throw new NotFoundException(
        `User with ID "${createOwnerDto.userId}" not found.`,
      );

    const existingOwner = await this.prisma.owner.findUnique({
      where: { userId: createOwnerDto.userId },
    });
    if (existingOwner)
      throw new ConflictException(
        `User with ID "${createOwnerDto.userId}" is already linked to an owner profile.`,
      );

    try {
      const newOwner = await this.prisma.$transaction(async (tx) => {
        const created = await tx.owner.create({
          data: createOwnerDto,
          include: { user: true },
        });
        await tx.user.update({
          where: { id: createOwnerDto.userId },
          data: { role: UserRole.OWNER },
        });
        return created;
      });
      return this.formatOwnerResponse(newOwner);
    } catch (error) {
      console.error('Error creating owner:', error);
      throw new InternalServerErrorException('Could not create owner profile.');
    }
  }

  async findAll(): Promise<any[]> {
    const owners = await this.prisma.owner.findMany({
      include: { user: true },
    });
    return owners.map(this.formatOwnerResponse);
  }

  async findOne(id: number): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: { user: true, properties: false }, // Include properties if needed by default
    });
    if (!owner) throw new NotFoundException(`Owner with ID "${id}" not found`);
    return this.formatOwnerResponse(owner);
  }

  // Find owner profile by the associated User ID
  async findByUserId(userId: number): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { userId },
      include: { user: true, properties: false },
    });
    if (!owner)
      throw new NotFoundException(
        `Owner profile for User ID "${userId}" not found`,
      );
    return this.formatOwnerResponse(owner);
  }

  async update(id: number, updateOwnerDto: UpdateOwnerDto): Promise<any> {
    const existing = await this.prisma.owner.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(`Owner with ID "${id}" not found`);

    try {
      const updatedOwner = await this.prisma.owner.update({
        where: { id },
        data: updateOwnerDto,
        include: { user: true },
      });
      return this.formatOwnerResponse(updatedOwner);
    } catch (error) {
      console.error('Error updating owner:', error);
      throw new InternalServerErrorException('Could not update owner profile.');
    }
  }

  async remove(id: number): Promise<any> {
    const existing = await this.prisma.owner.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing)
      throw new NotFoundException(`Owner with ID "${id}" not found.`);
    // Deleting owner will cascade delete properties due to schema relation
    try {
      await this.prisma.$transaction(async (tx) => {
        // Properties are deleted by cascade
        await tx.owner.delete({ where: { id } });
        // Optionally update user role
        await tx.user.update({
          where: { id: existing.userId },
          data: { role: UserRole.USER },
        });
      });
      return this.formatOwnerResponse(existing); // Return deleted data
    } catch (error) {
      console.error('Error removing owner:', error);
      throw new InternalServerErrorException(`Could not delete owner profile.`);
    }
  }
}
