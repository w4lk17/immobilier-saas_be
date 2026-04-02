import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  MinLength,
} from 'class-validator';

export class CreateOwnerDto {
  // --- Champs Auth & Identité de base ---
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

  // --- Champs Professionnels (User) ---
  @IsString()
  @IsOptional()
  workPlace?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  // --- Documents d'identité ---
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

  // --- Personne à contacter (PAC) ---
  @IsString()
  @IsOptional()
  pacLastName?: string;

  @IsString()
  @IsOptional()
  pacFirstName?: string;

  @IsString()
  @IsOptional()
  pacPhoneNumber?: string;

  // Pas de champs spécifiques à Owner dans le schéma actuel
}
