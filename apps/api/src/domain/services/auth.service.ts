import type { User } from '@prisma/client';
import { UserRole, UserStatus } from '@prisma/client';
import { PERMISSION_KEYS } from '@hrm/shared';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../../shared/helpers/hash.helper.js';
import { signAccessToken, type JwtPayload } from '../../shared/helpers/jwt.helper.js';
import { tenantRepository } from '../repositories/tenant.repository.js';
import { tenantDomainRepository } from '../repositories/tenant-domain.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { refreshTokenRepository } from '../repositories/refresh-token.repository.js';
import { permissionService } from './permission.service.js';
import { settingsService } from './settings.service.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { buildResetPasswordLink } from '../../shared/configs/email.config.js';
import { logger } from '../../shared/utils/logger.js';
import type {
  RegisterInput,
  LoginInput,
  SetPasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../../app/validators/auth.validator.js';

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
// "Remember me" off: the session ends when the browser closes, so a long-lived
// DB token would just be dead weight. Keep it short.
const SESSION_REFRESH_TOKEN_EXPIRES_DAYS = 1;
const INVITE_TOKEN_EXPIRES_DAYS = 7;
const RESET_TOKEN_EXPIRES_HOURS = 1;

/**
 * Resolve the permission keys exposed to the client. SUPER_ADMIN is implicit-all
 * (matches the requirePermission enum bypass); others resolve via their role.
 * The frontend uses this list for UI gating only — the server re-checks on every
 * request, so this is never the authority.
 */
async function resolvePermissions(user: User): Promise<string[]> {
  if (user.role === UserRole.SUPER_ADMIN) {
    return [...PERMISSION_KEYS];
  }
  if (!user.roleId) {
    return [];
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return [...granted];
}

async function userToDto(user: User) {
  // SPEC-033: FE cần biết user có hồ sơ nhân viên + loại hợp đồng (vd. hiện nav
  // "Tự đánh giá" chỉ khi đang PROBATION). Null khi user không gắn employee.
  const employee = await employeeRepository.findByUserId(user.id, user.tenantId);

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roleId: user.roleId,
    permissions: await resolvePermissions(user),
    status: user.status,
    tenantId: user.tenantId,
    employee: employee ? { id: employee.id, contractType: employee.contractType } : null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createTokens(
  user: User,
  persistent: boolean,
  // SPEC-037: session display — the device that opened the session and (after
  // a rotation) when it was last used.
  userAgent: string | null = null,
  lastUsedAt: Date | null = null,
) {
  const jwtPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    roleId: user.roleId,
    tenantId: user.tenantId,
  };

  const accessToken = await signAccessToken(jwtPayload);

  const refreshToken = generateToken();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() +
      (persistent ? REFRESH_TOKEN_EXPIRES_DAYS : SESSION_REFRESH_TOKEN_EXPIRES_DAYS),
  );

  await refreshTokenRepository.create({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt,
    persistent,
    userAgent,
    lastUsedAt,
  });

  return { accessToken, refreshToken, persistent };
}

export const authService = {
  async register(input: RegisterInput) {
    const tenant = await tenantRepository.findBySlug(input.tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    const existingUser = await userRepository.findByEmailAndTenant(input.email, tenant.id);
    if (existingUser) {
      throw new ConflictError('Email already registered in this organization');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      status: UserStatus.ACTIVE,
      tenant: { connect: { id: tenant.id } },
    });

    const { accessToken, refreshToken } = await createTokens(user, true);

    return {
      user: await userToDto(user),
      accessToken,
      refreshToken,
    };
  },

  async login(input: LoginInput, userAgent: string | null = null) {
    const tenant = await tenantRepository.findBySlug(input.tenantSlug);
    if (!tenant) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const user = await userRepository.findByEmailAndTenant(input.email, tenant.id);

    // SPEC-036: with forceSso on, password login is rejected tenant-wide —
    // before any password check and also for unknown emails, so the response
    // never reveals whether the account exists. SUPER_ADMIN keeps the password
    // path as the break-glass account (no self-lockout).
    const security = await settingsService.getSecuritySettings(tenant.id);
    if (security.forceSso && user?.role !== UserRole.SUPER_ADMIN) {
      throw new AppError('Password login is disabled. Sign in with SSO.', 403, 'SSO_REQUIRED');
    }

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('Account is not active');
    }

    await userRepository.updateLastLogin(user.id);
    const { accessToken, refreshToken, persistent } = await createTokens(
      user,
      input.rememberMe ?? false,
      userAgent,
    );

    return {
      user: await userToDto(user),
      accessToken,
      refreshToken,
      persistent,
    };
  },

  /**
   * Sign in with a Google Workspace identity that has already been verified by
   * googleService. This is INVITE-ONLY: Google replaces the password step but
   * never provisions accounts. The flow:
   *   1. Resolve the tenant from the email domain (tenant_domains table).
   *   2. Require an existing, ACTIVE user with that (email, tenant).
   * Every failure throws UnauthorizedError so the controller can redirect with
   * a single neutral message — we never reveal which step failed (no account
   * or tenant enumeration). The caller is responsible for having already
   * checked `emailVerified`.
   */
  async loginWithGoogle(
    identity: { email: string; emailVerified: boolean },
    userAgent: string | null = null,
  ) {
    if (!identity.emailVerified) {
      throw new UnauthorizedError('Google email not verified');
    }

    const domain = identity.email.split('@')[1]?.toLowerCase();
    if (!domain) {
      throw new UnauthorizedError('Invalid email');
    }

    const tenant = await tenantDomainRepository.findTenantByDomain(domain);
    if (!tenant) {
      throw new UnauthorizedError('SSO not available for this domain');
    }

    const user = await userRepository.findByEmailAndTenant(identity.email, tenant.id);
    if (!user) {
      throw new UnauthorizedError('No account for this email');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('Account is not active');
    }

    await userRepository.updateLastLogin(user.id);
    // SPEC-037: the first successful Google sign-in marks the account linked.
    if (!user.googleLinkedAt) {
      await userRepository.markGoogleLinked(user.id);
    }
    // SSO has no "remember me" checkbox — default to a persistent session.
    const { accessToken, refreshToken } = await createTokens(user, true, userAgent);

    return {
      user: await userToDto(user),
      accessToken,
      refreshToken,
    };
  },

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await refreshTokenRepository.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    await refreshTokenRepository.revoke(storedToken.id);

    const user = storedToken.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('Account is not active');
    }

    // Carry the original "remember me" choice forward: a session login stays a
    // session cookie after rotation (the cookie itself sends no expiry back).
    // The rotated token inherits the device and records the use (SPEC-037).
    const tokens = await createTokens(user, storedToken.persistent, storedToken.userAgent, new Date());

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      persistent: tokens.persistent,
    };
  },

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await refreshTokenRepository.findByTokenHash(tokenHash);

    if (storedToken) {
      await refreshTokenRepository.revoke(storedToken.id);
    }
  },

  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return userToDto(user);
  },

  /**
   * Issue a one-time invite token for a user so they can set their own
   * password (used by bulk import — no password is hashed at creation time).
   * Returns the RAW token to embed in the invite email; only its sha256 hash
   * is persisted. Overwrites any prior outstanding invite for this user.
   */
  async issueInvite(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TOKEN_EXPIRES_DAYS);

    await userRepository.setInvite(userId, tokenHash, expiresAt);

    return { token, expiresAt };
  },

  /**
   * Complete the invite flow: validate the token, set a bcrypt password hash,
   * activate the account, and consume the (single-use) token. Invalid, expired,
   * or already-used tokens all surface as a generic 400 to avoid token probing.
   */
  /**
   * SPEC-037 — self-service password change. Requires the current password;
   * honours the tenant security policy (forceSso, passwordMinLength); revokes
   * every other refresh token so stolen sessions die with the old password.
   * `currentRefreshTokenHash` (from the request cookie) identifies the session
   * to keep; null revokes all of them (caller without a refresh cookie).
   */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    currentRefreshTokenHash: string | null,
  ) {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const security = await settingsService.getSecuritySettings(user.tenantId);
    if (security.forceSso && user.role !== UserRole.SUPER_ADMIN) {
      throw new AppError('Password login is disabled. Sign in with SSO.', 403, 'SSO_REQUIRED');
    }

    const isValidPassword = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (input.newPassword.length < security.passwordMinLength) {
      throw new ValidationError(
        `Password must be at least ${security.passwordMinLength} characters`,
      );
    }

    const passwordHash = await hashPassword(input.newPassword);
    await userRepository.updatePassword(user.id, passwordHash);
    await refreshTokenRepository.revokeOthersForUser(user.id, currentRefreshTokenHash);
  },

  async setPasswordFromToken(input: SetPasswordInput) {
    const tokenHash = hashToken(input.token);
    const user = await userRepository.findByInviteTokenHash(tokenHash);

    if (!user || !user.inviteTokenExpiresAt) {
      throw new BadRequestError('Invalid or expired invite token');
    }
    if (user.inviteTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestError('Invalid or expired invite token');
    }

    // SPEC-036: the tenant can require longer passwords than the global Zod
    // floor (8); enforced here so both invite and reset flows honour it.
    const security = await settingsService.getSecuritySettings(user.tenantId);
    if (input.password.length < security.passwordMinLength) {
      throw new ValidationError(
        `Password must be at least ${security.passwordMinLength} characters`,
      );
    }

    const passwordHash = await hashPassword(input.password);
    const updated = await userRepository.activateWithPassword(user.id, passwordHash);

    return userToDto(updated);
  },

  /**
   * Begin the forgot-password flow. To avoid leaking which emails exist, this
   * always resolves regardless of outcome — the controller returns a uniform
   * 200. A reset token is only minted for an existing, ACTIVE account (INVITED
   * users have no password yet and use the invite flow instead). The reset
   * token reuses the single-use invite columns with a short 1-hour expiry.
   */
  async requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
    const tenant = await tenantRepository.findBySlug(input.tenantSlug);
    if (!tenant) {
      return;
    }

    const user = await userRepository.findByEmailAndTenant(input.email, tenant.id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return;
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000);

    await userRepository.setInvite(user.id, tokenHash, expiresAt);

    // Never surface email transport failures to the caller — it would both
    // leak account existence (timing/error) and break the uniform 200.
    try {
      await emailProvider.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        link: buildResetPasswordLink(token),
      });
    } catch (err) {
      logger.error({ event: 'auth.reset.email_failed', err }, 'Failed to send reset email');
    }
  },

  /**
   * Complete the forgot-password flow. The token mechanism is identical to the
   * invite flow (single-use, hashed, expiry-checked), so reuse it. For an
   * already-active account this simply rotates the password hash.
   */
  async resetPassword(input: ResetPasswordInput) {
    return this.setPasswordFromToken(input);
  },
};

