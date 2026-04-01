import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee, UserRole } from '@prisma/client';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) { }

  // Helper to exclude sensitive User data if included
  private formatEmployeeResponse(employee: Employee & { user?: any }): any {
    if (employee.user) {
      const { password, hashedRefreshToken, ...secureUser } = employee.user;
      return { ...employee, user: secureUser };
    }
    return employee;
  }

  async create(createEmployeeDto: CreateEmployeeDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: createEmployeeDto.userId },
    });
    if (!user) {
      throw new NotFoundException(
        `User with ID "${createEmployeeDto.userId}" not found.`,
      );
    }
    // Check if user already linked
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { userId: createEmployeeDto.userId },
    });
    if (existingEmployee) {
      throw new ConflictException(
        `User with ID "${createEmployeeDto.userId}" is already linked to an employee profile.`,
      );
    }

    try {
      // Start transaction to create employee and update user role
      const newEmployee = await this.prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: createEmployeeDto,
          include: { user: true },
        });
        // Update user role to EMPLOYEE
        await tx.user.update({
          where: { id: createEmployeeDto.userId },
          data: { role: UserRole.EMPLOYEE },
        });
        return created;
      });
      return this.formatEmployeeResponse(newEmployee);
    } catch (error) {
      console.error('Error creating employee:', error);
      throw new InternalServerErrorException(
        'Could not create employee profile.',
      );
    }
  }

  async findAll(): Promise<any[]> {
    const employees = await this.prisma.employee.findMany({
      include: { user: true }, // Selectively include user, excluding sensitive fields later
    });
    return employees.map(this.formatEmployeeResponse);
  }

  async findOne(id: number): Promise<any> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: true, // Include user details
        managedProperties: false, // Set to true if needed by default
        managedContracts: false, // Set to true if needed by default
      },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID "${id}" not found`);
    }
    return this.formatEmployeeResponse(employee);
  }

  async update(id: number, updateEmployeeDto: UpdateEmployeeDto): Promise<any> {
    // Find the employee first to ensure it exists
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Employee with ID "${id}" not found`);
    }
    try {
      const updatedEmployee = await this.prisma.employee.update({
        where: { id },
        data: updateEmployeeDto,
        include: { user: true },
      });
      return this.formatEmployeeResponse(updatedEmployee);
    } catch (error) {
      console.error('Error updating employee:', error);
      // Handle specific prisma errors if necessary
      throw new InternalServerErrorException(
        'Could not update employee profile.',
      );
    }
  }

  async remove(id: number): Promise<any> {
    // Check existence first
    const existing = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) {
      throw new NotFoundException(`Employee with ID "${id}" not found.`);
    }
    // Consider implications: managedProperties/Contracts have onDelete: SetNull/Restrict
    // Deleting the employee might be blocked by Contracts or set managerId to null on Properties
    try {
      // Reset user role back to USER? Or handle differently?
      await this.prisma.$transaction(async (tx) => {
        await tx.employee.delete({ where: { id } });
        // Optionally update the user's role back
        await tx.user.update({
          where: { id: existing.userId },
          data: { role: UserRole.USER }, // Or handle differently
        });
      });
      return this.formatEmployeeResponse(existing); // Return the deleted data
    } catch (error) {
      console.error('Error removing employee:', error);
      if (error.code === 'P2003') {
        // Foreign key constraint (likely from Contract)
        throw new ConflictException(
          `Cannot delete employee with ID "${id}" as they are linked to existing contracts.`,
        );
      }
      throw new InternalServerErrorException(
        `Could not delete employee profile.`,
      );
    }
  }
}
