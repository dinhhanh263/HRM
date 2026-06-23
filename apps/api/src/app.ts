import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { routes } from './app/routes/index.js';
import { errorHandler } from './app/middlewares/error.middleware.js';
import { internalTasksRouter } from './app/routes/internal-tasks.router.js';
import { registerAllHandlers } from './infrastructure/tasks/register-handlers.js';

const app: Express = express();

// Behind Cloud Run / a load balancer the real client IP is in X-Forwarded-For.
// express-rate-limit (SPEC-038) keys on req.ip, so without this every request
// would share the proxy's IP (and the limiter throws on a permissive setting).
// TRUST_PROXY = number of proxy hops to trust (1 for Cloud Run). Unset locally.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Body parsing. Limit raised above the 100kb default so a base64 data-URL avatar
// (FE caps the source image at 2MB ≈ 2.7MB once base64-encoded) fits in the JSON body.
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(cookieParser());

// Register Cloud Tasks handlers and mount the internal router
registerAllHandlers();
app.use(internalTasksRouter);

// Routes
app.use('/api/v1', routes);

// Legacy health check (for backwards compatibility)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling (must be last)
app.use(errorHandler);

export { app };
