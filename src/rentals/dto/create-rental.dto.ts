import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';
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
  surface: number;

  @IsBoolean()
  isFurnished?: boolean;

  @IsNumber()
  @IsNotEmpty()
  rentalValue: number;

  @IsNumber()
  @IsOptional()
  charges?: number;
}
