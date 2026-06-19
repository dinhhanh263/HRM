import http from 'node:http';
import { createImportWorker } from './domain/employee-import/employee-import.worker.js';
import { createInviteWorker } from './domain/employee-import/employee-import.invite.worker.js';
import { createReminderScanWorker } from './domain/reminders/reminders.scan.worker.js';
import { createReminderEmailWorker } from './domain/reminders/reminder-email.worker.js';
import { createCvParseWorker } from './domain/recruitment/cv-parse.worker.js';
import { scheduleDailyReminderScan } from './domain/reminders/reminders.queue.js';
import { logger } from './shared/utils/logger.js';

// Background-worker process. Runs the BullMQ consumers and registers the
// repeatable daily lifecycle-reminder scan. Deployed as its own Cloud Run
// service (`hrm-worker`) with `--min-instances=1 --no-cpu-throttling` so the
// queue is drained and the cron fires even with no inbound HTTP traffic.
const importWorker = createImportWorker();
const inviteWorker = createInviteWorker();
const reminderScanWorker = createReminderScanWorker();
const reminderEmailWorker = createReminderEmailWorker();
const cvParseWorker = createCvParseWorker();

const workers = {
  'employee-import': importWorker,
  'employee-invite': inviteWorker,
  'reminder-scan': reminderScanWorker,
  'reminder-email': reminderEmailWorker,
  'cv-parse': cvParseWorker,
};
// BullMQ Workers emit 'error' for infrastructure faults (e.g. Redis drops) that
// would otherwise surface as unhandled rejections. Log them via Pino so a
// degraded queue is visible rather than silent.
for (const [name, worker] of Object.entries(workers)) {
  worker.on('error', (err) => {
    logger.error({ err, event: 'worker.error', worker: name }, 'Background worker error');
  });
}

// Register the repeatable daily scan (idempotent — keyed by pattern+tz).
scheduleDailyReminderScan().catch((err) => {
  logger.error({ err, event: 'reminders.schedule.failed' }, 'Failed to schedule daily reminder scan');
});

// Cloud Run *services* must answer an HTTP health check on $PORT even when their
// real job is background processing. A tiny server keeps the container "ready".
const PORT = process.env.PORT || 3001;
const health = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', role: 'worker', timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end();
});
health.listen(PORT, () => {
  console.log(`[Worker] Background workers started; health on :${PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[Worker] ${signal} received, closing workers...`);
  health.close();
  await Promise.all([
    importWorker.close(),
    inviteWorker.close(),
    reminderScanWorker.close(),
    reminderEmailWorker.close(),
    cvParseWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
