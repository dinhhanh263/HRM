import { app } from './app.js';
import { createImportWorker } from './domain/employee-import/employee-import.worker.js';
import { createInviteWorker } from './domain/employee-import/employee-import.invite.worker.js';
import { createReminderScanWorker } from './domain/reminders/reminders.scan.worker.js';
import { createReminderEmailWorker } from './domain/reminders/reminder-email.worker.js';
import { createCvParseWorker } from './domain/recruitment/cv-parse.worker.js';
import { scheduleDailyReminderScan } from './domain/reminders/reminders.queue.js';
import { logger } from './shared/utils/logger.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[API] Server running at http://localhost:${PORT}`);
});

// Background workers: import queue, invite emails, the daily lifecycle-reminder
// scan, and the reminder emails that scan fans out.
const importWorker = createImportWorker();
const inviteWorker = createInviteWorker();
const reminderScanWorker = createReminderScanWorker();
const reminderEmailWorker = createReminderEmailWorker();
const cvParseWorker = createCvParseWorker();

// BullMQ Workers emit 'error' for infrastructure faults (e.g. Redis drops) that
// would otherwise surface as unhandled rejections. Log them via Pino so a
// degraded queue is visible rather than silent.
const workers = {
  'employee-import': importWorker,
  'employee-invite': inviteWorker,
  'reminder-scan': reminderScanWorker,
  'reminder-email': reminderEmailWorker,
  'cv-parse': cvParseWorker,
};
for (const [name, worker] of Object.entries(workers)) {
  worker.on('error', (err) => {
    logger.error({ err, event: 'worker.error', worker: name }, 'Background worker error');
  });
}

// Register the repeatable daily scan (idempotent — keyed by pattern+tz).
scheduleDailyReminderScan().catch((err) => {
  logger.error({ err, event: 'reminders.schedule.failed' }, 'Failed to schedule daily reminder scan');
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[API] ${signal} received, closing workers...`);
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
