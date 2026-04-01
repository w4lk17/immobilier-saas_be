import {
  IsInt,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { ContractStatus, LeaseType } from '@prisma/client';

export class CreateContractDto {
  @IsInt()
  @IsNotEmpty()
  ownerId: number;

  @IsInt()
  @IsNotEmpty()
  propertyId: number;

  @IsInt()
  @IsNotEmpty()
  rentalId: number;

  @IsInt()
  @IsNotEmpty()
  tenantId: number;

  @IsInt()
  @IsNotEmpty()
  managerId: number;

  @IsDateString()
  @IsNotEmpty()
  startDate: string | Date; // Use string and transform, or just Date

  @IsOptional()
  @IsDateString()
  endDate?: string | Date;

  @IsInt()
  @IsNotEmpty()
  rentDeposit: number;

  @IsInt()
  @IsNotEmpty()
  rentAdvance: number;

  @IsInt()
  @IsNotEmpty()
  dayAddToPaymentDay: number;

  @IsInt()
  @IsNotEmpty()
  paymentStartAfter: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rentAmount: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  depositAmount: number;

  @IsEnum(LeaseType)
  @IsNotEmpty()
  leaseType: LeaseType = LeaseType.RESIDENTIAL_LEASE;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus; // Defaults to ACTIVE
}
