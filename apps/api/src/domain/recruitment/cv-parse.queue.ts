import { Queue } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import {
  CV_PARSE_QUEUE_NAME,
  CV_PARSE_JOB_NAME,
  CV_PARSE_JOB_RETENTION_SECONDS,
} from '../../shared/configs/cv-parse.config.js';

/**
 * Payload for one CV-parse job. The worker re-reads the file from disk by id.
 * Two flavours share the same queue (so they share concurrency + retry policy):
 *  - `attachment`: a CV attached to an existing candidate (Task 3.3).
 *  - `bulk_item`:  a staged CV in a bulk-import batch (SPEC-027); parses into the
 *                  batch item's parsedData, never touching the candidate table.
 */
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

let queue: Queue<CvParseJobData> | null = null;

/** Lazily-constructed singleton queue (no Redis socket until first use). */
export function getCvParseQueue(): Queue<CvParseJobData> {
  if (!queue) {
    queue = new Queue<CvParseJobData>(CV_PARSE_QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        // One automatic retry: parsing can fail on a transient LLM/network blip,
        // but we never want an endless retry storm against a paid API.
        attempts: 2,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: CV_PARSE_JOB_RETENTION_SECONDS },
        removeOnFail: { age: CV_PARSE_JOB_RETENTION_SECONDS },
      },
    });
  }
  return queue;
}

/**
 * Enqueue a CV for background parsing. Failures here must never block the upload
 * flow, so callers wrap this in a try/catch and only log on error.
 */
export async function enqueueCvParse(data: CvParseJobData): Promise<string> {
  const job = await getCvParseQueue().add(CV_PARSE_JOB_NAME, data);
  return job.id!;
}
