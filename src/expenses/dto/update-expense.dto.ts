import { OmitType } from '@nestjs/mapped-types';
import { CreateExpenseDto } from './create-expense.dto';

// Allow updating most fields, perhaps restrict propertyId change
export class UpdateExpenseDto extends OmitType(CreateExpenseDto, [
  'propertyId',
]) {}
