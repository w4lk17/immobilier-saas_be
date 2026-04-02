import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  // L'admin seul peut changer le rôle via ce DTO,
  // mais il vaut mieux une route dédiée ou un control strict dans le service.
  // Pour la sécurité, on peut l'exclure ici et le gérer ailleurs.
}
