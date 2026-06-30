import { db } from '../../infrastructure/database/client.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';

export interface SalesEmailJob {
  messageId: string;
}

/** Deliver a queued sales email via Resend, then stamp SENT / FAILED. */
export async function salesEmailHandler(payload: unknown): Promise<void> {
  const { messageId } = payload as SalesEmailJob;
  const msg = await db.salesEmailMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.status !== 'QUEUED') return;

  try {
    await emailProvider.sendRaw({ to: msg.to, subject: msg.subject, body: msg.body });
    await db.salesEmailMessage.update({ where: { id: messageId }, data: { status: 'SENT', sentAt: new Date() } });
  } catch (err) {
    await db.salesEmailMessage.update({ where: { id: messageId }, data: { status: 'FAILED' } });
    throw err; // let the queue retry/backoff
  }
}
