import { Router, type Router as RouterType } from 'express';

const router: RouterType = Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

export { router as healthRoutes };
