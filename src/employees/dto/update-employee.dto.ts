import { OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

// Usually, you wouldn't change the linked user ID via update DTO
export class UpdateEmployeeDto extends OmitType(CreateEmployeeDto, [
  'userId',
] as const) {}
