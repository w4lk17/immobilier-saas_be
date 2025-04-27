import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  Min,
  IsEnum,
  IsDateString,
  IsOptional,
} from 'class-validator';
import { PaymentType, PaymentStatus } from '@prisma/client';

export class CreatePaymentDto {
  @IsInt()
  @IsNotEmpty()
  contractId: number;

  // tenantId is technically redundant if contractId is present, but can be useful for validation
  @IsInt()
  @IsNotEmpty()
  tenantId: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @IsEnum(PaymentType)
  @IsNotEmpty()
  type: PaymentType;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus; // Defaults to PENDING

  @IsDateString()
  @IsNotEmpty()
  dueDate: string | Date;

  @IsOptional()
  @IsDateString()
  paidDate?: string | Date;
}
