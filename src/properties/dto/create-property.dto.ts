import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { PropertyType, PropertyStatus } from '@prisma/client';

export class CreatePropertyDto {
  @IsInt()
  @IsNotEmpty()
  ownerId!: number;

  @IsInt()
  @IsOptional()
  managerId?: number;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PropertyType)
  @IsNotEmpty()
  type!: PropertyType;

  @IsNumber()
  @IsOptional()
  propertyValue?: number;

  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  @IsBoolean()
  @IsOptional()
  isForSale?: boolean;

  @IsNumber()
  @IsOptional()
  nLot?: number;

  @IsNumber()
  @IsOptional()
  lot?: number;

  @IsString()
  @IsOptional()
  landTitle?: string;

  @IsNumber()
  @IsOptional()
  surface?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;
}
