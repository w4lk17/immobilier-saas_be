import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';

// On exclut 'ownerId' : On ne change pas le propriétaire via un simple update.
// On exclut 'managerId' si sa gestion se fait ailleurs, ou on le laisse si un admin peut réassigner.
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
