import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto';

// Exclure 'contractId' et 'tenantId' pour éviter la fraude.
// Exclure 'invoiceNumber' qui est généré automatiquement.
export class UpdateInvoiceDto extends PartialType(
  OmitType(CreateInvoiceDto, ['contractId', 'tenantId', 'invoiceNumber'] as const),
) { }