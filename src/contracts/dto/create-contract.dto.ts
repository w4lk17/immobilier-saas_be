import {
  IsInt,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { ContractStatus } from '@prisma/client';

export class CreateContractDto {
  @IsInt()
  @IsNotEmpty()
  propertyId: number;

  @IsInt()
  @IsNotEmpty()
  tenantId: number;

  @IsInt()
  @IsNotEmpty()
  managerId: number; // Employee ID responsible

  @IsDateString()
  @IsNotEmpty()
  startDate: string | Date; // Use string and transform, or just Date

  @IsOptional()
  @IsDateString()
  endDate?: string | Date;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rentAmount: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  depositAmount: number;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus; // Defaults to ACTIVE
}
