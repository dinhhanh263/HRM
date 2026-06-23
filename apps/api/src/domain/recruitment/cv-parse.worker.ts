import { Prisma } from '@prisma/client';
import { extname } from 'node:path';
import { logger } from '../../shared/utils/logger.js';
import { readCvFile } from '../../infrastructure/storage/cv-storage.js';
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
    const buffer = await readCvFile(attachment.fileUrl);
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
export async function cvParseHandler(payload: unknown): Promise<void> {
  const job = payload as CvParseJobData;
  if (job.kind === 'bulk_item') {
    await bulkImportService.parseItem(job.itemId, job.tenantId);
    return;
  }
  await handleAttachmentJob(job);
}
