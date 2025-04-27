import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the roles defined for the handler/controller using the @Roles decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are required, allow access (might be handled by JwtAuthGuard already)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get the user object attached by JwtAuthGuard
    const { user } = context.switchToHttp().getRequest();

    // If no user is attached (e.g., error in JwtAuthGuard or public route mistakenly reaching here), deny access
    if (!user || !user.role) {
      // This shouldn't happen if JwtAuthGuard runs first successfully on a protected route
      console.error(
        'RolesGuard: User or user.role not found on request object.',
      );
      throw new ForbiddenException('User role information is missing.');
    }

    // Check if the user's role is included in the required roles
    const hasRequiredRole = requiredRoles.some((role) => user.role === role);

    if (!hasRequiredRole) {
      console.warn(
        `RolesGuard: User with role '<span class="math-inline">\{user\.role\}' does not have required roles\: \[</span>{requiredRoles.join(', ')}]`,
      );
      throw new ForbiddenException(
        `You do not have the required permissions (${requiredRoles.join(', ')}) to access this resource.`,
      );
    }

    // User has the required role
    return true;
  }
}
