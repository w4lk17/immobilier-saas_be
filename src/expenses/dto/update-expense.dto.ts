import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateExpenseDto } from './create-expense.dto';

// On ne change pas qui a enregistré la dépense ('recordedById') ni sur quelle propriété ('propertyId').
// C'est une preuve comptable.
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['propertyId', 'recordedById'] as const),
) { }