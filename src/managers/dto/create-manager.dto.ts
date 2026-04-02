import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  MinLength,
} from 'class-validator';
import { EmploymentType } from '@prisma/client';

export class CreateManagerDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  civility?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  pictureUrl?: string;

  @IsString()
  @IsOptional()
  workPlace?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @IsString()
  @IsOptional()
  identityDocumentNumber?: string;

  @IsString()
  @IsOptional()
  identityDocumentType?: string;

  @IsString()
  @IsOptional()
  identityDeliveryCity?: string;

  @IsDateString()
  @IsOptional()
  identityDeliveryDate?: string;

  @IsDateString()
  @IsOptional()
  identityExpiryDate?: string;

  @IsString()
  @IsOptional()
  pacLastName?: string;

  @IsString()
  @IsOptional()
  pacFirstName?: string;

  @IsString()
  @IsOptional()
  pacPhoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: EmploymentType;

  @IsDateString()
  @IsOptional()
  hireDate?: string;

  @IsDateString()
  @IsOptional()
  terminationDate?: string;
}
