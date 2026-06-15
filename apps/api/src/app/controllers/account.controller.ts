import type { Request, Response } from 'express';
import { accountService } from '../../domain/services/account.service.js';
import { hashToken } from '../../shared/helpers/hash.helper.js';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

function currentTokenHash(req: Request): string | null {
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
  return refreshToken ? hashToken(refreshToken) : null;
}

export const accountController = {
  async getAccount(req: Request, res: Response) {
    const user = req.user!;
    const data = await accountService.getAccount({ sub: user.sub, tenantId: user.tenantId });
    res.json({ success: true, data });
  },

  async updateProfile(req: Request, res: Response) {
    const user = req.user!;
    const data = await accountService.updateProfile(
      { sub: user.sub, tenantId: user.tenantId },
      req.body,
    );
    res.json({ success: true, data });
  },

  async updateNotificationPrefs(req: Request, res: Response) {
    const user = req.user!;
    const data = await accountService.updateNotificationPrefs(
      { sub: user.sub, tenantId: user.tenantId },
      req.body,
    );
    res.json({ success: true, data });
  },

  async getSessions(req: Request, res: Response) {
    const user = req.user!;
    const data = await accountService.getSessions(
      { sub: user.sub, tenantId: user.tenantId },
      currentTokenHash(req),
    );
    res.json({ success: true, data });
  },

  async revokeOtherSessions(req: Request, res: Response) {
    const user = req.user!;
    const data = await accountService.revokeOtherSessions(
      { sub: user.sub, tenantId: user.tenantId },
      currentTokenHash(req),
    );
    res.json({ success: true, data });
  },
};
