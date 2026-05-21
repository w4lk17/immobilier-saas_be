import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
} from 'class-validator';

// Les slugs disponibles tels que définis dans ton seed
export enum PlanSlug {
  BASIC = 'basic',
  STANDARD = 'standard',
  PRO = 'pro',
  PREMIUM = 'premium',
}
export class RegisterDto {
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
  @IsNotEmpty()
  companyName: string; // Nom de l'organisation

  @IsOptional()
  @IsEnum(PlanSlug)
  planSlug: PlanSlug = PlanSlug.BASIC;
}
