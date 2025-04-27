import { IsString, IsOptional, IsInt, IsNotEmpty } from 'class-validator';

export class CreateTenantDto {
  @IsInt()
  @IsNotEmpty()
  userId: number; // ID of an existing User

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
