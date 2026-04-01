import { IsString, IsNotEmpty, IsNumber, IsDateString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { ExpenseType, ExpenseStatus } from '@prisma/client';

export class CreateExpenseDto {
  @IsInt()
  @IsNotEmpty()
  propertyId: number;

  @IsInt()
  @IsOptional()
  rentalId?: number;

  // recordedById est généralement récupéré du JWT (user connecté), 
  // mais on peut le laisser ici pour les cas admin ou validation manuelle
  @IsInt()
  @IsNotEmpty()
  recordedById: number;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsEnum(ExpenseType)
  @IsNotEmpty()
  type: ExpenseType;

  @IsEnum(ExpenseStatus)
  @IsOptional()
  status?: ExpenseStatus;
}