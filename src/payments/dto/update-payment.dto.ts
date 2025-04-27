import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

// Typically only status and paidDate are updated
export class UpdatePaymentDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  paidDate?: string | Date;

  // You might add amount or type if corrections are allowed
}
