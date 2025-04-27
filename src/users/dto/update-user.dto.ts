import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString } from 'class-validator';

// Exclude password/email changes from basic update or handle carefully
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  password?: string; // Handle password update separately in service (hashing!)

  @IsOptional()
  @IsString()
  hashedRefreshToken?: string; // Only allow internal updates via AuthService
}
