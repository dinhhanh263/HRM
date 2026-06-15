import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;

/**
 * Per-user discriminator appended to the IP so offices behind a shared NAT
 * are not locked out by one colleague's typos. In order of availability:
 * email (login/register/forgot) → body token (set/reset-password; tokens are
 * crypto.randomBytes(32), infeasible to enumerate, so keying by them does not
 * open a brute-force bypass) → Authorization header (change-password).
 */
function clientDiscriminator(req: Request): string {
  if (typeof req.body?.email === 'string' && req.body.email.trim() !== '') {
    return req.body.email.trim().toLowerCase();
  }
  if (typeof req.body?.token === 'string' && req.body.token !== '') {
    return req.body.token;
  }
  return req.headers.authorization ?? '';
}

/**
 * SPEC-038: brute-force protection for credential-bearing auth endpoints.
 *
 * One shared instance: the route path is part of the key, so each endpoint
 * gets its own 5-attempts/15-min bucket. ipKeyGenerator handles IPv6 subnets.
 */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: AUTH_MAX_ATTEMPTS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Read per-request so tests can toggle without rebuilding the app.
  skip: () => process.env.RATE_LIMIT_DISABLED === 'true',
  keyGenerator: (req: Request) =>
    `${req.path}:${ipKeyGenerator(req.ip ?? '')}:${clientDiscriminator(req)}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts, please try again later',
      },
    });
  },
});
