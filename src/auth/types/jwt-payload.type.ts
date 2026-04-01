export type JwtPayload = {
  sub: number;
  email: string;
  role: string;
};

export type JwtPayloadWithRt = JwtPayload & { refreshToken: string };

export type RequestUser = {
  id: number;   // On peut utiliser 'id' ici pour être cohérent avec Prisma/Code
  email: string;
  role: string;
  isActive: boolean;
};