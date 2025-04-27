import { OmitType } from '@nestjs/mapped-types';
import { CreateOwnerDto } from './create-owner.dto';

export class UpdateOwnerDto extends OmitType(CreateOwnerDto, [
  'userId',
] as const) {}
