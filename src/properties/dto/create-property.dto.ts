import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsInt,
} from 'class-validator';
import { PropertyType, PropertyStatus } from '@prisma/client';

export class CreatePropertyDto {
  @IsInt()
  @IsNotEmpty()
  ownerId: number;

  @IsInt()
  @IsOptional()
  managerId?: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PropertyType)
  @IsNotEmpty()
  type: PropertyType;

  @IsNumber()
  @IsNotEmpty()
  propertyValue: number;

  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;
}
