import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../types';

// Decorator to get specific field from user payload (e.g., userId)
export const GetCurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    // On caste en "RequestUser | undefined" car sur une route publique, user n'existe pas
    const user = request.user as RequestUser | undefined;

    if (!user) return null; // Si pas d'utilisateur, on retourne null (pas d'erreur)

    // Si on demande une donnée spécifique (ex: 'id'), on la retourne
    if (data) return user[data];

    // Sinon on retourne tout l'objet user
    return user;
  },
);
