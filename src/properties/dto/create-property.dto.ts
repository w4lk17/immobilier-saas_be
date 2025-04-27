import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsNumber,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { PropertyType, PropertyStatus } from '@prisma/client';

export class CreatePropertyDto {
  @IsInt()
  @IsNotEmpty()
  ownerId: number;

  @IsOptional()
  @IsInt()
  managerId?: number; // Employee ID

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(PropertyType)
  @IsNotEmpty()
  type: PropertyType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rentAmount: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  charges: number;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus; // Defaults to AVAILABLE
}
