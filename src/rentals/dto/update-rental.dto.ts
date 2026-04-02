import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRentalDto } from './create-rental.dto';

// On exclut 'propertyId' : Une location ne change pas de propriété parent.
export class UpdateRentalDto extends PartialType(
  OmitType(CreateRentalDto, ['propertyId'] as const),
) {}
