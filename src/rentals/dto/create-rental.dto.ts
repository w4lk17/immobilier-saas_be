import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, IsInt } from 'class-validator';
import { RentalType, RentalStatus } from '@prisma/client';

export class CreateRentalDto {
  @IsInt()
  @IsNotEmpty()
  propertyId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(RentalType)
  @IsNotEmpty()
  type: RentalType;

  @IsEnum(RentalStatus)
  @IsOptional()
  status?: RentalStatus;

  @IsInt()
  @IsOptional()
  roomCount?: number;

  @IsNumber()
  @IsNotEmpty()
  rentalValue: number;

  @IsNumber()
  @IsOptional()
  charges?: number;
}