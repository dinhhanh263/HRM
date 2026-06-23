import { registerHandler } from './task-registry.js';
import { cvParseHandler } from '../../domain/recruitment/cv-parse.worker.js';
import { employeeImportHandler } from '../../domain/employee-import/employee-import.worker.js';
import { inviteHandler } from '../../domain/employee-import/employee-import.invite.worker.js';
import { reminderEmailHandler } from '../../domain/reminders/reminder-email.worker.js';
import { reminderScanHandler } from '../../domain/reminders/reminders.scan.worker.js';

let registered = false;

/** Register every task handler exactly once. Imported at app startup so both the
 * inline driver and the internal router can resolve handlers by name. */
export function registerAllHandlers(): void {
  if (registered) return;
  registerHandler('cv-parse', cvParseHandler);
  registerHandler('employee-import', employeeImportHandler);
  registerHandler('employee-invite', inviteHandler);
  registerHandler('reminder-email', reminderEmailHandler);
  registerHandler('reminder-scan', reminderScanHandler);
  registered = true;
}
