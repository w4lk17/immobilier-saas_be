import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // Helper to check if user has permission for a given property
  private async checkPropertyPermission(
    propertyId: number,
    user: JwtPayload,
  ): Promise<{ authorized: boolean; property?: any }> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { owner: true, manager: true }, // Include relations needed for checks
    });

    if (!property) return { authorized: false }; // Property not found is handled separately

    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.sub } })
        : null;
    const employeeProfile =
      user.role === UserRole.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;

    const isOwnerOfProperty =
      ownerProfile && property.ownerId === ownerProfile.id;
    const isManagerOfProperty =
      employeeProfile && property.managerId === employeeProfile.id;

    if (
      user.role === UserRole.ADMIN ||
      isOwnerOfProperty ||
      isManagerOfProperty
    ) {
      return { authorized: true, property };
    }

    return { authorized: false, property };
  }

  async create(
    createExpenseDto: CreateExpenseDto,
    user: JwtPayload,
  ): Promise<Expense> {
    // 1. Check property exists and user has permission
    const { authorized, property } = await this.checkPropertyPermission(
      createExpenseDto.propertyId,
      user,
    );
    if (!property)
      throw new NotFoundException(
        `Property with ID ${createExpenseDto.propertyId} not found.`,
      );
    if (!authorized)
      throw new ForbiddenException(
        `You do not have permission to add expenses for property ID ${createExpenseDto.propertyId}.`,
      );

    try {
      return await this.prisma.expense.create({
        data: createExpenseDto,
        include: { property: true },
      });
    } catch (error) {
      console.error('Error creating expense:', error);
      throw new InternalServerErrorException('Could not create expense.');
    }
  }

  async findAll(user: JwtPayload): Promise<Expense[]> {
    const queryArgs: any = {
      include: { property: true },
    };

    // Filter based on role
    if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (!ownerProfile) return [];
      queryArgs.where = { property: { ownerId: ownerProfile.id } };
    } else if (user.role === UserRole.EMPLOYEE) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });
      if (!employeeProfile) return [];
      queryArgs.where = { property: { managerId: employeeProfile.id } };
    }
    // Admins see all

    // TODO: Pagination
    const expenses = await this.prisma.expense.findMany(queryArgs);
    // TODO: Format response?
    return expenses;
  }

  async findOne(id: number, user: JwtPayload): Promise<Expense> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { property: true }, // Need property for permission check
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID "${id}" not found`);
    }

    // Authorization Check
    const { authorized } = await this.checkPropertyPermission(
      expense.propertyId,
      user,
    );
    if (!authorized) {
      throw new ForbiddenException(
        'You do not have permission to view this expense.',
      );
    }

    return expense;
  }

  async update(
    id: number,
    updateExpenseDto: UpdateExpenseDto,
    user: JwtPayload,
  ): Promise<Expense> {
    // 1. Find expense first to get propertyId
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense)
      throw new NotFoundException(`Expense with ID "${id}" not found.`);

    // 2. Check permission for the associated property
    const { authorized } = await this.checkPropertyPermission(
      expense.propertyId,
      user,
    );
    if (!authorized) {
      throw new ForbiddenException(
        `You do not have permission to update expenses for property ID ${expense.propertyId}.`,
      );
    }

    try {
      return await this.prisma.expense.update({
        where: { id },
        data: updateExpenseDto,
        include: { property: true },
      });
    } catch (error) {
      console.error('Error updating expense:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Expense with ID "${id}" not found.`);
      throw new InternalServerErrorException('Could not update expense.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Expense> {
    // 1. Find expense first to get propertyId
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense)
      throw new NotFoundException(`Expense with ID "${id}" not found.`);

    // 2. Check permission for the associated property
    const { authorized } = await this.checkPropertyPermission(
      expense.propertyId,
      user,
    );
    if (!authorized) {
      throw new ForbiddenException(
        `You do not have permission to delete expenses for property ID ${expense.propertyId}.`,
      );
    }

    try {
      return await this.prisma.expense.delete({ where: { id } });
    } catch (error) {
      console.error('Error removing expense:', error);
      if (error.code === 'P2025')
        throw new NotFoundException(`Expense with ID "${id}" not found.`);
      throw new InternalServerErrorException(`Could not delete expense.`);
    }
  }
}
