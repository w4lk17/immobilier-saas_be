import {
  IsInt,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import { ContractStatus, LeaseType } from '@prisma/client';

export class CreateContractDto {
  // @IsInt()
  // @IsNotEmpty()
  // ownerId: number;

  // @IsInt()
  // @IsNotEmpty()
  // propertyId: number;

  // @IsInt()
  // @IsNotEmpty()
  // rentalId: number;

  // @IsInt()
  // @IsNotEmpty()
  // tenantId: number;

  // @IsInt()
  // @IsNotEmpty()
  // managerId: number;

  // @IsDateString()
  // @IsNotEmpty()
  // startDate: string | Date; // Use string and transform, or just Date

  // @IsOptional()
  // @IsDateString()
  // endDate?: string | Date;

  // @IsInt()
  // @IsNotEmpty()
  // rentDeposit: number;

  // @IsInt()
  // @IsNotEmpty()
  // rentAdvance: number;

  // @IsInt()
  // @IsNotEmpty()
  // dayAddToPaymentDay: number;

  // @IsInt()
  // @IsNotEmpty()
  // paymentStartAfter: number;

  // @IsNumber()
  // @Min(0)
  // @IsNotEmpty()
  // rentAmount: number;

  // @IsNumber()
  // @IsNotEmpty()
  // @Min(0)
  // depositAmount: number;

  // @IsEnum(LeaseType)
  // @IsNotEmpty()
  // leaseType: LeaseType = LeaseType.RESIDENTIAL_LEASE;

  // @IsOptional()
  // @IsEnum(ContractStatus)
  // status?: ContractStatus; // Defaults to ACTIVE


  // Locataire
  @IsNumber()
  tenantId: number; // ID utilisateur du locataire (User.id), pas l'ID du profil Tenant.

  // Bien (MVP)
  @IsString()
  @IsNotEmpty()
  designation: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  // Financier
  @IsNumber()
  @IsPositive()
  rentAmount: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  chargesAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  advanceAmount?: number;

  // Dates
  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  // Options de paiement
  @IsNumber()
  @IsOptional()
  @Max(3)
  rentDeposit?: number; // Nombre de mois de caution

  @IsNumber()
  @IsOptional()
  @Max(3)
  rentAdvance?: number; // Nombre de mois d'avance (ex: 1er mois payé à l'avance)

  @IsNumber()
  @IsOptional()
  paymentStartAfter?: number; // Décalage début paiement (mois)

  @IsNumber()
  @IsOptional()
  dayAddToPaymentDay?: number; // Jour du mois prélèvement

  @IsEnum(LeaseType)
  @IsOptional()
  leaseType?: LeaseType;

  @IsString()
  @IsOptional()
  pdfUrl?: string;
  
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus; // Defaults to ACTIVE
}
