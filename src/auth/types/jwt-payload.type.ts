export type JwtPayload = {
  sub: number; // User ID
  email: string;
  role: string; // Add roles or other relevant info
};

export type JwtPayloadWithRt = JwtPayload & { refreshToken: string };
