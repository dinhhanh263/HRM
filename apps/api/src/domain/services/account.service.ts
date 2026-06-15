import type { MyAccountDto, MySessionDto } from '@hrm/shared';
import { accountRepository } from '../repositories/account.repository.js';
import { refreshTokenRepository } from '../repositories/refresh-token.repository.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import type {
  UpdateMyProfileInput,
  UpdateNotificationPrefsInput,
} from '../../app/validators/account.validator.js';

interface AccountActor {
  sub: string;
  tenantId: string;
}

// Best-effort "Chrome · macOS" — good enough to recognise one's own devices;
// no fingerprinting library needed. Order matters (Edge UA contains "Chrome").
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** SPEC-037: human-readable device label from a raw user agent. */
export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (!browser && !system) return null;
  return [browser, system].filter(Boolean).join(' · ');
}

export const accountService = {
  async getAccount(actor: AccountActor): Promise<MyAccountDto> {
    const [user, employee] = await Promise.all([
      accountRepository.findUser(actor.sub),
      accountRepository.findEmployeeProfile(actor.sub, actor.tenantId),
    ]);
    if (!user) {
      throw new NotFoundError('Account not found');
    }

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      employee: employee
        ? {
            id: employee.id,
            employeeCode: employee.employeeCode,
            departmentName: employee.department?.name ?? null,
            positionName: employee.position?.name ?? null,
            joinDate: employee.joinDate.toISOString(),
            phone: employee.phone,
            avatar: employee.avatar,
          }
        : null,
      googleLinkedAt: user.googleLinkedAt?.toISOString() ?? null,
      notificationPrefs: (user.notificationPrefs as Record<string, boolean> | null) ?? {},
    };
  },

  /** Self-edit of the whitelisted profile fields (phone, avatar). */
  async updateProfile(actor: AccountActor, input: UpdateMyProfileInput): Promise<MyAccountDto> {
    const employee = await accountRepository.findEmployeeProfile(actor.sub, actor.tenantId);
    if (!employee) {
      throw new NotFoundError('No employee profile linked to this account');
    }

    await accountRepository.updateEmployeeProfile(employee.id, {
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      // Chuỗi rỗng = gỡ avatar.
      ...(input.avatar !== undefined ? { avatar: input.avatar || null } : {}),
    });

    return this.getAccount(actor);
  },

  /** Email prefs per reminder kind — merged so one toggle never resets another. */
  async updateNotificationPrefs(
    actor: AccountActor,
    input: UpdateNotificationPrefsInput,
  ): Promise<MyAccountDto> {
    const user = await accountRepository.findUser(actor.sub);
    if (!user) {
      throw new NotFoundError('Account not found');
    }
    const current = (user.notificationPrefs as Record<string, boolean> | null) ?? {};
    await accountRepository.updateNotificationPrefs(actor.sub, { ...current, ...input });
    return this.getAccount(actor);
  },

  /** Active sessions of the caller; `current` matches the request's cookie hash. */
  async getSessions(actor: AccountActor, currentTokenHash: string | null): Promise<MySessionDto[]> {
    const tokens = await refreshTokenRepository.listActiveForUser(actor.sub);
    return tokens.map((t) => ({
      id: t.id,
      device: describeUserAgent(t.userAgent),
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      persistent: t.persistent,
      current: currentTokenHash !== null && t.tokenHash === currentTokenHash,
    }));
  },

  /**
   * Revoke every session except the current one. Requires the refresh cookie —
   * without it we cannot tell which session to keep, and revoking the caller's
   * own session as a side effect would be hostile.
   */
  async revokeOtherSessions(
    actor: AccountActor,
    currentTokenHash: string | null,
  ): Promise<{ revoked: number }> {
    if (!currentTokenHash) {
      throw new BadRequestError('Current session could not be identified');
    }
    const result = await refreshTokenRepository.revokeOthersForUser(actor.sub, currentTokenHash);
    return { revoked: result.count };
  },
};
