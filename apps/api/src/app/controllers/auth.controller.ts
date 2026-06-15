import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { authService } from '../../domain/services/auth.service.js';
import { googleService } from '../../domain/services/google.service.js';
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_MS,
  GOOGLE_SUCCESS_REDIRECT,
  GOOGLE_FAILURE_REDIRECT,
  isGoogleSsoConfigured,
} from '../../shared/configs/google.config.js';
import { logger } from '../../shared/utils/logger.js';
import { hashToken } from '../../shared/helpers/hash.helper.js';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cookie options for the refresh token. When `persistent` (remember me), the
 * cookie carries a maxAge so it survives a browser restart. When not, we omit
 * maxAge/expires so the browser treats it as a session cookie and drops it on
 * close — matching the shorter server-side token TTL.
 */
function refreshCookieOptions(persistent: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(persistent ? { maxAge: REFRESH_COOKIE_MAX_AGE_MS } : {}),
  };
}

// Short-lived cookie holding the OAuth CSRF `state`. SameSite=lax so it
// survives the top-level GET redirect back from Google to our callback.
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: GOOGLE_STATE_TTL_MS,
  path: '/',
};

/** Append a neutral error code to the failure URL (never leaks the reason). */
function failureUrl(code = 'sso'): string {
  const sep = GOOGLE_FAILURE_REDIRECT.includes('?') ? '&' : '?';
  return `${GOOGLE_FAILURE_REDIRECT}${sep}error=${code}`;
}

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOptions(true));

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body, req.headers['user-agent'] ?? null);

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOptions(result.persistent));

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  },

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' },
      });
      return;
    }

    const result = await authService.refresh(refreshToken);

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOptions(result.persistent));

    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
      },
    });
  },

  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  },

  async me(req: Request, res: Response) {
    const user = await authService.getMe(req.user!.sub);

    res.json({
      success: true,
      data: user,
    });
  },

  // SPEC-037: the refresh cookie identifies the session to KEEP; every other
  // session is revoked together with the old password.
  async changePassword(req: Request, res: Response) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    const keepTokenHash = refreshToken ? hashToken(refreshToken) : null;

    await authService.changePassword(req.user!.sub, req.body, keepTokenHash);

    res.json({ success: true, data: { message: 'Password changed' } });
  },

  async setPassword(req: Request, res: Response) {
    const user = await authService.setPasswordFromToken(req.body);

    res.json({
      success: true,
      data: { user },
    });
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.requestPasswordReset(req.body);

    // Uniform response regardless of whether the email exists — avoids
    // account enumeration.
    res.json({
      success: true,
      data: { message: 'If an account exists for that email, a reset link has been sent.' },
    });
  },

  async resetPassword(req: Request, res: Response) {
    const user = await authService.resetPassword(req.body);

    res.json({
      success: true,
      data: { user },
    });
  },

  /**
   * Start Google Workspace SSO: mint a CSRF `state`, stash it in a short-lived
   * httpOnly cookie, and redirect the browser to Google's consent screen.
   */
  async googleStart(_req: Request, res: Response) {
    if (!isGoogleSsoConfigured()) {
      logger.warn({ event: 'auth.google.not_configured' });
      res.redirect(failureUrl('sso_unavailable'));
      return;
    }

    const state = randomBytes(32).toString('hex');
    res.cookie(GOOGLE_STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
    res.redirect(googleService.getAuthUrl(state));
  },

  /**
   * Google redirects back here with `code` + `state`. We verify the state
   * (CSRF), exchange the code, require a verified email, then delegate to the
   * invite-only loginWithGoogle. On success we set the same refresh cookie as
   * a normal login and bounce to the frontend, which calls /auth/refresh.
   * Every failure redirects to the login page with a neutral ?error code.
   */
  async googleCallback(req: Request, res: Response) {
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/' });

    if (!isGoogleSsoConfigured()) {
      res.redirect(failureUrl('sso_unavailable'));
      return;
    }

    const { code, state } = req.query;
    const cookieState = req.cookies[GOOGLE_STATE_COOKIE];

    // CSRF: state must be present and match the cookie we set in googleStart.
    if (
      typeof state !== 'string' ||
      typeof cookieState !== 'string' ||
      state !== cookieState
    ) {
      logger.warn({ event: 'auth.google.rejected', reason: 'state_mismatch' });
      res.redirect(failureUrl());
      return;
    }

    if (typeof code !== 'string' || code.length === 0) {
      logger.warn({ event: 'auth.google.rejected', reason: 'missing_code' });
      res.redirect(failureUrl());
      return;
    }

    try {
      const identity = await googleService.verifyCode(code);
      const result = await authService.loginWithGoogle(identity, req.headers['user-agent'] ?? null);

      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOptions(true));
      logger.info({ event: 'auth.google.success', tenantId: result.user.tenantId });
      res.redirect(GOOGLE_SUCCESS_REDIRECT);
    } catch (err) {
      // Neutral redirect — do not reveal whether the tenant/user existed or
      // why verification failed (anti-enumeration). Log a coarse reason only.
      logger.warn({
        event: 'auth.google.rejected',
        reason: err instanceof Error ? err.name : 'unknown',
      });
      res.redirect(failureUrl());
    }
  },
};
