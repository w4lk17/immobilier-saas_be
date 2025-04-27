import { PartialType } from '@nestjs/mapped-types';
import { CreateContractDto } from './create-contract.dto';
import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { ContractStatus } from '@prisma/client';

// Allow updating specific fields like status, end date, maybe rent/deposit
export class UpdateContractDto {
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsDateString()
  endDate?: string | Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
  // Usually don't change property/tenant/manager after creation via simple update
}
