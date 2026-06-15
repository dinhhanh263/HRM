import type { Request, Response } from 'express';

export const recruitmentController = {
  async ping(_req: Request, res: Response) {
    res.json({ success: true, data: { status: 'ok', module: 'recruitment' } });
  },
};
