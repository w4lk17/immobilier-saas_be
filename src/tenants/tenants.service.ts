import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant, UserRole } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  // Helper to exclude sensitive User data
  private formatTenantResponse(tenant: Tenant & { user?: any }): any {
    if (tenant.user) {
      const { password, hashedRefreshToken, ...secureUser } = tenant.user;
      return { ...tenant, user: secureUser };
    }
    return tenant;
  }

  async create(createTenantDto: CreateTenantDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: createTenantDto.userId },
    });
    if (!user)
      throw new NotFoundException(
        `User with ID "${createTenantDto.userId}" not found.`,
      );

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { userId: createTenantDto.userId },
    });
    if (existingTenant)
      throw new ConflictException(
        `User with ID "${createTenantDto.userId}" is already linked to a tenant profile.`,
      );

    try {
      const newTenant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: createTenantDto,
          include: { user: true },
        });
        await tx.user.update({
          where: { id: createTenantDto.userId },
          data: { role: UserRole.TENANT },
        });
        return created;
      });
      return this.formatTenantResponse(newTenant);
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw new InternalServerErrorException(
        'Could not create tenant profile.',
      );
    }
  }

  async findAll(): Promise<any[]> {
    const tenants = await this.prisma.tenant.findMany({
      include: { user: true },
    });
    return tenants.map(this.formatTenantResponse);
  }

  async findOne(id: number): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { user: true, contracts: false, payments: false }, // Include related if needed
    });
    if (!tenant)
      throw new NotFoundException(`Tenant with ID "${id}" not found`);
    return this.formatTenantResponse(tenant);
  }

  // Find tenant profile by the associated User ID
  async findByUserId(userId: number): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { userId },
      include: { user: true, contracts: false, payments: false },
    });
    if (!tenant)
      throw new NotFoundException(
        `Tenant profile for User ID "${userId}" not found`,
      );
    return this.formatTenantResponse(tenant);
  }

  async update(id: number, updateTenantDto: UpdateTenantDto): Promise<any> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(`Tenant with ID "${id}" not found`);

    try {
      const updatedTenant = await this.prisma.tenant.update({
        where: { id },
        data: updateTenantDto,
        include: { user: true },
      });
      return this.formatTenantResponse(updatedTenant);
    } catch (error) {
      console.error('Error updating tenant:', error);
      throw new InternalServerErrorException(
        'Could not update tenant profile.',
      );
    }
  }

  async remove(id: number): Promise<any> {
    const existing = await this.prisma.tenant.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing)
      throw new NotFoundException(`Tenant with ID "${id}" not found.`);
    // Deleting tenant might be restricted by active contracts/payments
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.delete({ where: { id } });
        // Optionally update user role
        await tx.user.update({
          where: { id: existing.userId },
          data: { role: UserRole.USER },
        });
      });
      return this.formatTenantResponse(existing); // Return deleted data
    } catch (error) {
      console.error('Error removing tenant:', error);
      if (error.code === 'P2003') {
        // Foreign key constraint violation
        throw new ConflictException(
          `Cannot delete tenant with ID "${id}" due to existing related records (contracts or payments).`,
        );
      }
      throw new InternalServerErrorException(
        `Could not delete tenant profile.`,
      );
    }
  }
}
