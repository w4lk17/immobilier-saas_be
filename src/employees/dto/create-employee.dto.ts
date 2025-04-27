import { IsString, IsOptional, IsInt, IsNotEmpty } from 'class-validator';

export class CreateEmployeeDto {
  @IsInt()
  @IsNotEmpty()
  userId: number; // ID of an existing User

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsOptional()
  @IsString() // Add phone number validation if needed
  phoneNumber?: string;

  // hireDate defaults in schema
}
