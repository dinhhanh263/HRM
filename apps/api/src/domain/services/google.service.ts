import { OAuth2Client } from 'google-auth-library';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from '../../shared/configs/google.config.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';

/** Verified identity extracted from a Google id_token. */
export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

// One client instance is enough; it carries no per-request state.
let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!client) {
    client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  }
  return client;
}

export const googleService = {
  /**
   * Build the Google consent URL to redirect the browser to. `state` is the
   * CSRF token we later verify in the callback. `prompt: 'select_account'`
   * forces the account chooser so a wrong logged-in Google session can be
   * switched.
   */
  getAuthUrl(state: string): string {
    return getClient().generateAuthUrl({
      access_type: 'online',
      scope: GOOGLE_SCOPES,
      state,
      prompt: 'select_account',
    });
  },

  /**
   * Exchange an authorization `code` for tokens and verify the returned
   * id_token's signature/audience/expiry with Google. Returns the verified
   * identity. Throws UnauthorizedError on any failure — callers must treat a
   * throw as "reject the login" without leaking detail to the user.
   */
  async verifyCode(code: string): Promise<GoogleIdentity> {
    const c = getClient();

    const { tokens } = await c.getToken(code);
    if (!tokens.id_token) {
      throw new UnauthorizedError('Google did not return an id_token');
    }

    const ticket = await c.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedError('Google id_token has no email');
    }

    return {
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  },
};
