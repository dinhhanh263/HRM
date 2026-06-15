// Configuration for Google Workspace SSO (OAuth 2.0 authorization-code flow).
// Secrets are read from env and must never be logged. When credentials are
// unset, `isGoogleSsoConfigured()` returns false so the auth routes can return
// a clean "SSO not configured" error instead of crashing or leaking a stack.

/** OAuth client id from Google Cloud Console (safe to expose to the browser). */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

/** OAuth client secret — server-side only, never sent to the client or logged. */
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

// Redirect URI registered in Google Console; must match exactly. In dev this
// points at the Vite origin (:5173) which proxies /api to the backend — that
// way the refresh cookie set by the callback lands on the SAME origin the SPA
// runs on, so the subsequent /auth/refresh call sends it.
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5173/api/v1/auth/google/callback';

/** Frontend URL the callback bounces to after issuing the refresh cookie. */
export const GOOGLE_SUCCESS_REDIRECT =
  process.env.GOOGLE_SUCCESS_REDIRECT ?? 'http://localhost:5173/auth/google/success';

/** Where to send the browser when SSO fails. Carries a neutral ?error code. */
export const GOOGLE_FAILURE_REDIRECT =
  process.env.GOOGLE_FAILURE_REDIRECT ?? 'http://localhost:5173/login';

/** OAuth scopes — identity only; we never request Gmail/Drive access. */
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

/** Name of the short-lived httpOnly cookie holding the CSRF `state` value. */
export const GOOGLE_STATE_COOKIE = 'g_oauth_state';

/** How long the state cookie lives (ms). The consent round-trip is short. */
export const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * True only when both id and secret are present. Used to gate the routes so a
 * misconfigured deploy fails loud-but-clean rather than producing a broken
 * redirect to Google.
 */
export function isGoogleSsoConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0 && GOOGLE_CLIENT_SECRET.length > 0;
}
