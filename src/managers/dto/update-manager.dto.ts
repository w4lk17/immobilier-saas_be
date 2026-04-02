import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateManagerDto } from './create-manager.dto';

export class UpdateManagerDto extends PartialType(
  OmitType(CreateManagerDto, ['password', 'email'] as const),
) {}
