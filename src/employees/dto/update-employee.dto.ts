import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

// On exclut password et email pour la sécurité
// On notera que isActive n'est PAS inclus ici, car géré via une route dédiée
export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, ['password', 'email'] as const),
) { }