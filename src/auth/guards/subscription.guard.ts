import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService, private reflector: Reflector) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    if (!user || !user.organizationId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    // Récupérer l'organisation avec les détails de l'abonnement
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
      },
    });

    if (!organization) {
      throw new ForbiddenException('Organisation introuvable');
    }

    const now = new Date();

    // LOGIQUE DE VERIFICATION
    if (organization.subscriptionStatus === 'TRIAL') {
      // Si essai terminé
      if (organization.trialEndsAt && now > organization.trialEndsAt) {
        throw new ForbiddenException('Votre période d\'essai gratuite de 14 jours est terminée. Veuillez souscrire à un abonnement.');
      }
    } else if (organization.subscriptionStatus === 'ACTIVE') {
      // Si abonnement terminé
      if (organization.subscriptionEndsAt && now > organization.subscriptionEndsAt) {
        throw new ForbiddenException('Votre abonnement a expiré. Veuillez le renouveler.');
      }
    } else if (organization.subscriptionStatus === 'PAST_DUE' || organization.subscriptionStatus === 'CANCELED') {
      throw new ForbiddenException('Accès suspendu. Veuillez régulariser votre situation.');
    }

    return true;
  }
}