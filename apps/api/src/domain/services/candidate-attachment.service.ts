import type { CandidateAttachment } from '@prisma/client';
import type { ParsedResume } from '@hrm/shared';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { candidateAttachmentRepository } from '../repositories/candidate-attachment.repository.js';
import { extractCvText } from '../recruitment/cv-text-extract.js';
import { enqueueCvParse } from '../recruitment/cv-parse.queue.js';
import { storeCvFile, createCvReadStream } from '../../infrastructure/storage/cv-storage.js';

interface UploadedCv {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

// Whether plain text was extracted from the file at upload time. We persist the
// outcome under parsed_data so the DTO can report it without re-reading the file.
function readHasText(a: CandidateAttachment): boolean {
  const pd = a.parsedData as { hasText?: boolean } | null;
  if (pd && typeof pd.hasText === 'boolean') return pd.hasText;
  // Once the resume parser (3.3) fills structured fields, treat that as text.
  return a.parseStatus === 'DONE';
}

// The structured parse result lives under parsed_data.parsed once the worker
// completes. Returned to the UI as a *suggestion* — never auto-applied.
function readParsed(a: CandidateAttachment): ParsedResume | null {
  const pd = a.parsedData as { parsed?: ParsedResume } | null;
  return pd?.parsed ?? null;
}

function toDto(a: CandidateAttachment) {
  return {
    id: a.id,
    candidateId: a.candidateId,
    kind: a.kind,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    parseStatus: a.parseStatus,
    parserProvider: a.parserProvider,
    parsedAt: a.parsedAt?.toISOString() ?? null,
    hasText: readHasText(a),
    parsed: readParsed(a),
    createdAt: a.createdAt.toISOString(),
  };
}

export const candidateAttachmentService = {
  async list(candidateId: string, tenantId: string) {
    const candidate = await candidateRepository.findById(candidateId, tenantId);
    if (!candidate) throw new NotFoundError('Candidate not found');
    const rows = await candidateAttachmentRepository.findByCandidate(candidateId);
    return rows.map(toDto);
  },

  /**
   * Store a CV file, extract its text, and create a PENDING attachment. Multiple
   * uploads create multiple versions; the candidate's rawCvText always mirrors
   * the latest file that yielded text. Image-scanned PDFs (no text) still upload
   * successfully — hasText is false so the UI can flag them.
   */
  async upload(candidateId: string, tenantId: string, file: UploadedCv) {
    const candidate = await candidateRepository.findById(candidateId, tenantId);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const { text, hasText } = await extractCvText(file.buffer, file.mimeType);
    const stored = await storeCvFile(file.buffer, file.originalName, file.mimeType);

    const attachment = await candidateAttachmentRepository.create({
      candidateId,
      kind: 'CV',
      fileName: file.originalName,
      fileUrl: stored.fileUrl,
      parsedData: { hasText, chars: text.length },
    });

    // Latest CV with usable text wins; don't clobber existing text with an empty
    // extraction from an image-only scan.
    if (hasText) {
      await candidateAttachmentRepository.updateCandidateRawText(candidateId, text);
    }

    // Kick off background parsing. A queue/Redis hiccup must never fail the
    // upload — the CV is already saved; the recruiter can re-parse later.
    await this.tryEnqueueParse(attachment.id, candidateId, tenantId);

    return toDto(attachment);
  },

  /**
   * Re-run the parser for an existing attachment (e.g. after a FAILED parse or
   * to refresh suggestions). Returns the attachment flipped to PROCESSING so the
   * UI reflects the in-flight state immediately.
   */
  async reparse(id: string, candidateId: string, tenantId: string) {
    const attachment = await candidateAttachmentRepository.findByIdScoped(
      id,
      candidateId,
      tenantId
    );
    if (!attachment) throw new NotFoundError('Attachment not found');

    await this.tryEnqueueParse(id, candidateId, tenantId);
    const updated = await candidateAttachmentRepository.markParsing(id);
    return toDto(updated);
  },

  /** Enqueue a parse job, swallowing (but logging) queue failures. */
  async tryEnqueueParse(attachmentId: string, candidateId: string, tenantId: string) {
    try {
      await enqueueCvParse({ kind: 'attachment', attachmentId, candidateId, tenantId });
    } catch (err) {
      logger.error({ err, attachmentId }, 'Failed to enqueue CV parse');
    }
  },

  /** Open a download stream for an attachment, tenant-scoped. */
  async getDownload(id: string, candidateId: string, tenantId: string) {
    const attachment = await candidateAttachmentRepository.findByIdScoped(
      id,
      candidateId,
      tenantId
    );
    if (!attachment) throw new NotFoundError('Attachment not found');
    const { stream, contentType } = await createCvReadStream(attachment.fileUrl);
    return { stream, contentType, fileName: attachment.fileName };
  },
};
