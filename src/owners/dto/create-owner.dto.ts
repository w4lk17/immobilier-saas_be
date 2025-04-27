import { IsString, IsOptional, IsInt, IsNotEmpty } from 'class-validator';

export class CreateOwnerDto {
  @IsInt()
  @IsNotEmpty()
  userId: number; // ID of an existing User

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
