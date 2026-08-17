export type JwtPayload = {
  sub: number;
  email: string;
  role: string;
};

export type JwtPayloadWithRt = JwtPayload & { refreshToken: string };

export type RequestUser = {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  organizationId: number;
  firstName?: string;    
  lastName?: string;     
}
