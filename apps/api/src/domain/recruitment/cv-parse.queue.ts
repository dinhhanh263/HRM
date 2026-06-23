import { randomUUID } from 'node:crypto';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';

export interface CvParseAttachmentJob {
  kind: 'attachment';
  attachmentId: string;
  candidateId: string;
  tenantId: string;
}

export interface CvParseBulkItemJob {
  kind: 'bulk_item';
  itemId: string;
  batchId: string;
  tenantId: string;
}

export type CvParseJobData = CvParseAttachmentJob | CvParseBulkItemJob;

export interface CvParseJobResult {
  status: 'DONE' | 'FAILED';
  provider: string | null;
}

/**
 * Enqueue a CV for background parsing via Cloud Tasks. Returns a generated id
 * (kept for call-site compatibility). Failures here must never block the upload
 * flow, so callers wrap this in try/catch and only log on error.
 */
export async function enqueueCvParse(data: CvParseJobData): Promise<string> {
  const id = randomUUID();
  await enqueueTask('cv-parse', data);
  return id;
}
