import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-key');
const JWT_ISSUER = 'hrm-api';
const JWT_AUDIENCE = 'hrm-web';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  roleId: string | null;
  tenantId: string;
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';

  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return {
    sub: payload.sub as string,
    email: payload.email as string,
    role: payload.role as string,
    roleId: (payload.roleId as string | null) ?? null,
    tenantId: payload.tenantId as string,
  };
}
