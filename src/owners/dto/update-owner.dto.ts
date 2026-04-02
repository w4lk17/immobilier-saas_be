import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateOwnerDto } from './create-owner.dto';

// On exclut 'password' car le changement de mdp doit passer par une route spécifique
// On exclut 'email' si tu veux empêcher le changement d'email (souvent sensible)
export class UpdateOwnerDto extends PartialType(
  OmitType(CreateOwnerDto, ['password', 'email'] as const),
) {}
