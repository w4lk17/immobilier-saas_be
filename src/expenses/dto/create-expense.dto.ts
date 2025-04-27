import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  Min,
  IsString,
  IsDateString,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ExpenseType, ExpenseStatus } from '@prisma/client';

export class CreateExpenseDto {
  @IsInt()
  @IsNotEmpty()
  propertyId: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  @IsNotEmpty()
  date: string | Date;

  @IsEnum(ExpenseType)
  @IsNotEmpty()
  type: ExpenseType;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus; // Defaults to PENDING
}
