import { app } from './app.js';
import { logger } from './shared/utils/logger.js';

// HTTP API process. BullMQ workers and the repeatable daily reminder scan run in
// a SEPARATE process (`worker.ts` → the `hrm-worker` Cloud Run service) so they
// keep running even when the API scales to zero / has its CPU throttled between
// requests. Locally `pnpm dev` runs only this; start the worker with
// `pnpm --filter @hrm/api dev:worker` (or just rely on it in production).
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[API] Server running at http://localhost:${PORT}`);
});

function shutdown(signal: string): void {
  console.log(`[API] ${signal} received, closing HTTP server...`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Surface unexpected boot failures via Pino rather than a bare stack trace.
process.on('unhandledRejection', (err) => {
  logger.error({ err, event: 'api.unhandledRejection' }, 'Unhandled rejection in API process');
});
