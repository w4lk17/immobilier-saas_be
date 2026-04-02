import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateContractDto } from './create-contract.dto';

// On exclut TOUTES les clés étrangères d'identité.
// On ne change PAS le locataire, le propriétaire ou le bien en cours de contrat.
// On modifie seulement les détails (dates, montant si renouvellement, statut).
export class UpdateContractDto extends PartialType(
  OmitType(CreateContractDto, [
    'ownerId',
    'tenantId',
    'propertyId',
    'rentalId',
    'managerId',
  ] as const),
) {}
