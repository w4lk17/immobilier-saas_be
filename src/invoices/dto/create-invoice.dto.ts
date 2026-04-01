import { IsString, IsNotEmpty, IsNumber, IsDateString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { InvoiceType, InvoiceStatus } from '@prisma/client';

export class CreateInvoiceDto {
  @IsInt()
  @IsNotEmpty()
  contractId: number;

  @IsInt()
  @IsNotEmpty()
  tenantId: number;

  @IsNumber()
  @IsNotEmpty()
  amountDue: number;

  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @IsEnum(InvoiceType)
  @IsNotEmpty()
  type: InvoiceType;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsDateString()
  @IsOptional()
  paidDate?: string;

  // invoiceNumber est souvent généré automatiquement, mais peut être optionnel ici
  @IsString()
  @IsOptional()
  invoiceNumber?: string;
}