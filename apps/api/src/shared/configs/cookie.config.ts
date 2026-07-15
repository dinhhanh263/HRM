/**
 * Single httpOnly session cookie shared by the refresh token AND the Google
 * OAuth CSRF state. The name MUST be `__session`: Firebase Hosting rewrites to
 * Cloud Run strip every request cookie EXCEPT one literally named `__session`
 * (https://firebase.google.com/docs/hosting/manage-cache#using_cookies), so any
 * other name silently never reaches the API behind hosting — refresh always
 * 401s and the OAuth callback always sees state_mismatch.
 *
 * The two uses never need to coexist: the state value only lives during the
 * Google round-trip (the user is re-authenticating anyway, losing the old
 * refresh cookie is harmless) and the successful callback immediately
 * overwrites it with the refresh token (same name + path + domain = one cookie).
 */
export const SESSION_COOKIE = '__session';
