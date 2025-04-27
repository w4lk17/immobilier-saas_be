import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client'; // Import your UserRole enum

export const ROLES_KEY = 'roles';
// Pass allowed roles as arguments: @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
