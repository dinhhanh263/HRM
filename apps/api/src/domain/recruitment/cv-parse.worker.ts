import { Worker, type Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import { CV_PARSE_QUEUE_NAME } from '../../shared/configs/cv-parse.config.js';
import { logger } from '../../shared/utils/logger.js';
import { resolveCvDiskPath } from '../../infrastructure/storage/cv-storage.js';
import { candidateAttachmentRepository } from '../repositories/candidate-attachment.repository.js';
import { bulkImportService } from '../services/bulk-import.service.js';
import { extractCvText } from './cv-text-extract.js';
import { getResumeParser } from './resume-parser.js';
import type {
  CvParseAttachmentJob,
  CvParseJobData,
  CvParseJobResult,
} from './cv-parse.queue.js';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function mimeFromFileUrl(fileUrl: string): string {
  return MIME_BY_EXT[extname(fileUrl).toLowerCase()] ?? '';
}

/**
 * Parse one CV attachment. Re-reads the stored file (version-specific, rather
 * than relying on candidate.rawCvText which only mirrors the latest upload),
 * extracts text, runs the configured parser, and persists the structured
 * suggestion. A missing file or parser error flips the attachment to FAILED so
 * the recruiter can retry — it never throws past the worker boundary in a way
 * that would lose the attachment's recoverable state.
 */
async function handleAttachmentJob(
  data: CvParseAttachmentJob
): Promise<CvParseJobResult> {
  const { attachmentId, candidateId, tenantId } = data;

  const attachment = await candidateAttachmentRepository.findByIdScoped(
    attachmentId,
    candidateId,
    tenantId
  );
  if (!attachment) {
    // Deleted between enqueue and processing — nothing to do.
    return { status: 'FAILED', provider: null };
  }

  await candidateAttachmentRepository.markParsing(attachmentId);

  try {
    const diskPath = resolveCvDiskPath(attachment.fileUrl);
    if (!diskPath) throw new Error('CV file path could not be resolved');

    const buffer = await readFile(diskPath);
    const { text, hasText } = await extractCvText(
      buffer,
      mimeFromFileUrl(attachment.fileUrl)
    );

    const parser = await getResumeParser();
    const parsed = await parser.parse(text);

    // Cast through unknown: ParsedResume is a typed interface, but Prisma's
    // InputJsonValue wants an index signature. The shape is plain JSON.
    await candidateAttachmentRepository.markParsed(
      attachmentId,
      { hasText, chars: text.length, parsed } as unknown as Prisma.InputJsonValue,
      parser.provider
    );

    return { status: 'DONE', provider: parser.provider };
  } catch (err) {
    // Log the failure WITHOUT any CV content (no PII).
    logger.error({ err, attachmentId }, 'CV parse failed');
    await candidateAttachmentRepository.markParseFailed(attachmentId);
    return { status: 'FAILED', provider: null };
  }
}

/**
 * Route a parse job by kind. `attachment` enriches an existing candidate's CV;
 * `bulk_item` parses a staged CV in an import batch (its own error handling +
 * filename fallback live in the service). Both share this queue's retry policy.
 */
async function handleCvParseJob(job: Job<CvParseJobData>): Promise<CvParseJobResult> {
  if (job.data.kind === 'bulk_item') {
    await bulkImportService.parseItem(job.data.itemId, job.data.tenantId);
    return { status: 'DONE', provider: null };
  }
  return handleAttachmentJob(job.data);
}

/**
 * Start the CV-parse worker. Called once at server startup (and in tests). The
 * caller owns the returned Worker and must `close()` it on shutdown.
 */
export function createCvParseWorker(): Worker<CvParseJobData, CvParseJobResult> {
  return new Worker<CvParseJobData, CvParseJobResult>(
    CV_PARSE_QUEUE_NAME,
    handleCvParseJob,
    {
      connection: createQueueConnection(),
      concurrency: 2,
    }
  );
}
