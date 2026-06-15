import type { BulkImportBatch, BulkImportItem, Prisma } from '@prisma/client';
import type {
  BulkImportBatchDto,
  BulkImportConfirmResultDto,
  BulkImportItemDto,
  BulkImportItemResolution,
  ParsedResume,
} from '@hrm/shared';
import { extname, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { AppError, NotFoundError, BadRequestError } from '../../shared/errors/AppError.js';
import type { UpdateBulkItemInput } from '../../app/validators/recruitment.validator.js';
import { logger } from '../../shared/utils/logger.js';
import { bulkImportRepository } from '../repositories/bulk-import.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { extractCvText } from '../recruitment/cv-text-extract.js';
import { getResumeParser } from '../recruitment/resume-parser.js';
import { enqueueCvParse } from '../recruitment/cv-parse.queue.js';
import { computeDedup, type DedupSibling } from '../recruitment/bulk-dedup.helper.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { candidateService } from './candidate.service.js';
import { applicationService } from './application.service.js';
import { candidateAttachmentRepository } from '../repositories/candidate-attachment.repository.js';
import { normalizePhone } from '../recruitment/candidate-normalize.js';
import {
  storeCvFile,
  resolveCvDiskPath,
  deleteCvFile,
} from '../../infrastructure/storage/cv-storage.js';

interface UploadedCv {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

// parsedData persists the upload/parse outcome so the DTO can be built without
// re-reading the file: { hasText, chars, parsed }.
interface ItemParsedData {
  hasText?: boolean;
  chars?: number;
  parsed?: ParsedResume | null;
}

function readParsedData(item: BulkImportItem): ItemParsedData | null {
  return (item.parsedData as ItemParsedData | null) ?? null;
}

function toItemDto(item: BulkImportItem): BulkImportItemDto {
  const pd = readParsedData(item);
  return {
    id: item.id,
    status: item.status,
    resolution: item.resolution,
    fileName: item.fileName,
    fileUrl: item.fileUrl,
    mimeType: item.mimeType,
    hasText: pd?.hasText ?? false,
    parseStatus: item.parseStatus,
    parserProvider: item.parserProvider,
    parsed: pd?.parsed ?? null,
    reviewed: (item.reviewedData as ParsedResume | null) ?? null,
    duplicateOfCandidateId: item.duplicateOfCandidateId,
    duplicateReason: item.duplicateReason,
    candidateId: item.candidateId,
    applicationId: item.applicationId,
    failureReason: item.failureReason,
    createdAt: item.createdAt.toISOString(),
  };
}

function toBatchDto(
  batch: BulkImportBatch & { items: BulkImportItem[] }
): BulkImportBatchDto {
  return {
    id: batch.id,
    tenantId: batch.tenantId,
    jobId: batch.jobId,
    status: batch.status,
    totalItems: batch.totalItems,
    createdAt: batch.createdAt.toISOString(),
    confirmedAt: batch.confirmedAt?.toISOString() ?? null,
    items: batch.items.map(toItemDto),
  };
}

/**
 * Turn a filename into a human-ish name when a CV yields no text (image-only
 * scans): "nguyen-van-a_CV.final.pdf" → "Nguyen Van A CV". Better than a blank
 * card — HR can still see which file it was and edit the name before confirming.
 */
function nameFromFileName(fileName: string): string {
  const stem = basename(fileName, extname(fileName));
  const cleaned = stem
    .replace(/[._\-]+/g, ' ')
    .replace(/\b(cv|resume|hoso|ho so)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || stem.trim() || fileName;
}

export const bulkImportService = {
  /**
   * Create a staging batch for a job: store each CV to disk, create one PARSING
   * item per file, and enqueue background parsing. No candidate/application is
   * touched here — that only happens on confirm (Task 2.2).
   */
  async createBatch(jobId: string, tenantId: string, userId: string, files: UploadedCv[]) {
    const job = await jobRepository.findById(jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    const stored = await Promise.all(
      files.map(async (file) => {
        const s = await storeCvFile(file.buffer, file.originalName, file.mimeType);
        return { fileName: file.originalName, fileUrl: s.fileUrl, mimeType: file.mimeType };
      })
    );

    const batch = await bulkImportRepository.createBatchWithItems(
      { tenantId, jobId, createdById: userId },
      stored
    );

    // Enqueue per item. A queue hiccup must never fail the upload — the files are
    // already saved; the item stays PARSING and can be re-driven later.
    await Promise.all(
      batch.items.map((item) => this.tryEnqueueParse(item.id, batch.id, tenantId))
    );

    return toBatchDto(batch);
  },

  async getBatch(batchId: string, tenantId: string) {
    const batch = await bulkImportRepository.findBatchById(batchId, tenantId);
    if (!batch) throw new NotFoundError('Bulk import batch not found');
    return toBatchDto(batch);
  },

  /**
   * HR edits one staged item before confirming: overlay the reviewed suggestion
   * and/or change the resolution. Editing is only meaningful pre-confirm — once an
   * item is committed (CONFIRMED/SKIPPED/FAILED) it is frozen.
   */
  async updateItem(
    batchId: string,
    itemId: string,
    tenantId: string,
    input: UpdateBulkItemInput
  ): Promise<BulkImportItemDto> {
    const item = await bulkImportRepository.findItemById(itemId, tenantId);
    if (!item || item.batchId !== batchId) throw new NotFoundError('Bulk import item not found');

    if (item.status === 'CONFIRMED' || item.status === 'SKIPPED' || item.status === 'FAILED') {
      throw new BadRequestError(
        'Mục này đã được xử lý, không thể chỉnh sửa',
        'BULK_ITEM_NOT_EDITABLE'
      );
    }

    const patch: { reviewedData?: Prisma.InputJsonValue; resolution?: typeof input.resolution } = {};
    if (input.reviewed !== undefined) {
      // Overlay onto the existing reviewed draft so a partial PATCH touches only
      // the fields HR changed.
      const existing = (item.reviewedData as ParsedResume | null) ?? {};
      patch.reviewedData = { ...existing, ...input.reviewed } as unknown as Prisma.InputJsonValue;
    }
    if (input.resolution !== undefined) patch.resolution = input.resolution;

    const updated = await bulkImportRepository.updateItemReview(itemId, patch);
    return toItemDto(updated);
  },

  /**
   * Cancel a batch: best-effort delete every staged file from disk (they're no
   * longer needed) and mark the batch CANCELLED. File deletion never throws, so a
   * missing file can't block the cancel.
   */
  async cancelBatch(batchId: string, tenantId: string): Promise<BulkImportBatchDto> {
    const batch = await bulkImportRepository.findBatchById(batchId, tenantId);
    if (!batch) throw new NotFoundError('Bulk import batch not found');

    await Promise.all(batch.items.map((item) => deleteCvFile(item.fileUrl)));
    await bulkImportRepository.updateBatchStatus(batchId, 'CANCELLED');

    return toBatchDto({ ...batch, status: 'CANCELLED' });
  },

  /**
   * Once the last item leaves PARSING, a DRAFT batch is ready for HR review.
   * Idempotent: only flips DRAFT→REVIEWING, so a cancelled batch stays cancelled
   * and concurrent workers finishing together can't clobber the state.
   */
  async maybePromoteBatch(batchId: string, tenantId: string) {
    const batch = await bulkImportRepository.findBatchById(batchId, tenantId);
    if (!batch || batch.status !== 'DRAFT') return;

    const stillParsing = await bulkImportRepository.countItemsByStatus(batchId, 'PARSING');
    if (stillParsing === 0) {
      await bulkImportRepository.updateBatchStatus(batchId, 'REVIEWING');
    }
  },

  async tryEnqueueParse(itemId: string, batchId: string, tenantId: string) {
    try {
      await enqueueCvParse({ kind: 'bulk_item', itemId, batchId, tenantId });
    } catch (err) {
      logger.error({ err, itemId }, 'Failed to enqueue bulk-import parse');
    }
  },

  /**
   * Worker callback: parse one staged CV. Re-reads the stored file, extracts
   * text, runs the resume parser, and persists the suggestion. Image-only scans
   * (no text) still succeed — we fall back to a name derived from the filename so
   * the item is reviewable rather than failed.
   */
  async parseItem(itemId: string, tenantId: string) {
    const item = await bulkImportRepository.findItemById(itemId, tenantId);
    if (!item) return; // Deleted between enqueue and processing.

    await bulkImportRepository.markItemParsing(itemId);

    try {
      const diskPath = resolveCvDiskPath(item.fileUrl);
      if (!diskPath) throw new Error('CV file path could not be resolved');

      const buffer = await readFile(diskPath);
      const { text, hasText } = await extractCvText(buffer, item.mimeType);

      let parsed: ParsedResume;
      let provider: string;
      if (hasText) {
        const parser = await getResumeParser();
        parsed = await parser.parse(text);
        provider = parser.provider;
      } else {
        parsed = { fullName: nameFromFileName(item.fileName), skills: [] };
        provider = 'filename-fallback';
      }

      // Ensure there's always a name to show; fall back to the filename.
      if (!parsed.fullName) parsed.fullName = nameFromFileName(item.fileName);

      const dedup = await this.computeItemDedup(item.batchId, itemId, tenantId, parsed);

      const parsedData = { hasText, chars: text.length, parsed };
      await bulkImportRepository.markItemParsed(
        itemId,
        parsedData as unknown as Prisma.InputJsonValue,
        parsed as unknown as Prisma.InputJsonValue,
        provider,
        // Persist the raw text so confirm can seed candidate.rawCvText for search
        // without re-reading the file. Empty (image-only scans) stores null.
        hasText ? text : null,
        dedup
      );
    } catch (err) {
      // Log without CV content (no PII).
      logger.error({ err, itemId }, 'Bulk-import CV parse failed');
      await bulkImportRepository.markItemParseFailed(itemId, 'PARSE_ERROR');
    }

    // Whether parse succeeded or failed, this item left PARSING — the batch may now
    // be fully parsed and ready for review.
    await this.maybePromoteBatch(item.batchId, tenantId);
  },

  /**
   * Soft dedupe one parsed CV against existing candidates and the rest of the
   * batch. Pulls the tenant's candidate set once (bounded; fine for MVP volumes)
   * and the already-parsed siblings, then delegates the decision to the pure
   * helper. Never throws — duplicates are flagged for HR, not blocked.
   */
  async computeItemDedup(
    batchId: string,
    itemId: string,
    tenantId: string,
    parsed: ParsedResume
  ) {
    const [pool, siblings] = await Promise.all([
      candidateRepository.findNameCandidates(tenantId),
      bulkImportRepository.findSiblingParsedItems(batchId, itemId),
    ]);

    const siblingKeys: DedupSibling[] = siblings.map((s) => {
      const p = (s.parsedData as ItemParsedData | null)?.parsed ?? null;
      return { email: p?.email ?? null, phone: p?.phone ?? null };
    });

    return computeDedup(
      { email: parsed.email, phone: parsed.phone, fullName: parsed.fullName },
      pool,
      siblingKeys
    );
  },

  /**
   * Commit a reviewed batch: per item, create or link a candidate, attach the CV,
   * and auto-create an application into the job's first stage. Each item commits
   * independently — one item's failure is recorded and never rolls back siblings.
   * SKIP items are skipped; a NEW that races into an existing candidate degrades
   * to a link rather than erroring.
   */
  async confirm(
    batchId: string,
    tenantId: string,
    userId: string
  ): Promise<BulkImportConfirmResultDto> {
    const batch = await bulkImportRepository.findBatchById(batchId, tenantId);
    if (!batch) throw new NotFoundError('Bulk import batch not found');

    if (batch.status !== 'REVIEWING') {
      throw new BadRequestError(
        'Chỉ có thể xác nhận đợt đang ở trạng thái review',
        'BULK_BATCH_NOT_REVIEWING'
      );
    }
    const stillParsing = await bulkImportRepository.countItemsByStatus(batchId, 'PARSING');
    if (stillParsing > 0) {
      throw new BadRequestError('Vẫn còn CV đang phân tích', 'BULK_BATCH_STILL_PARSING');
    }

    // Race-safe gate: only the caller that flips REVIEWING→CONFIRMED commits the
    // items. A concurrent/duplicate confirm loses the claim and bails here, so
    // the batch's candidates/applications are created exactly once.
    const claimed = await bulkImportRepository.claimBatchForConfirm(batchId, tenantId);
    if (!claimed) {
      throw new BadRequestError(
        'Chỉ có thể xác nhận đợt đang ở trạng thái review',
        'BULK_BATCH_NOT_REVIEWING'
      );
    }

    const summary = { created: 0, linked: 0, skipped: 0, failed: 0 };

    for (const item of batch.items) {
      // Already terminal — leave as-is (defensive; a REVIEWING batch shouldn't have any).
      if (item.status === 'CONFIRMED' || item.status === 'SKIPPED' || item.status === 'FAILED') {
        continue;
      }

      if (item.resolution === 'SKIP') {
        await bulkImportRepository.updateItemStatus(item.id, 'SKIPPED');
        summary.skipped += 1;
        continue;
      }

      // Only a successfully-parsed item carries the reviewed data needed to commit.
      if (item.status !== 'PARSED') {
        await bulkImportRepository.markItemFailed(item.id, 'NOT_PARSED');
        summary.failed += 1;
        continue;
      }

      try {
        const outcome = await this.commitItem(item, batch.jobId, tenantId, userId);
        if (outcome === 'created') summary.created += 1;
        else summary.linked += 1;
      } catch (err) {
        const reason = err instanceof AppError ? err.code : 'CONFIRM_ERROR';
        logger.error({ err, itemId: item.id }, 'Bulk-import item confirm failed');
        await bulkImportRepository.markItemFailed(item.id, reason);
        summary.failed += 1;
      }
    }

    // Batch was already flipped to CONFIRMED when we claimed it above.
    const fresh = await bulkImportRepository.findBatchById(batchId, tenantId);
    if (!fresh) throw new NotFoundError('Bulk import batch not found');
    return { batch: toBatchDto(fresh), summary };
  },

  /**
   * Commit one PARSED item. Returns whether a new candidate was created or an
   * existing one was linked. Throws on any unrecoverable error so the caller can
   * mark the item FAILED without aborting the rest of the batch.
   */
  async commitItem(
    item: BulkImportItem,
    jobId: string,
    tenantId: string,
    userId: string
  ): Promise<'created' | 'linked'> {
    const reviewed: Partial<ParsedResume> = (item.reviewedData as ParsedResume | null) ?? {};
    if (!reviewed.fullName) {
      throw new BadRequestError('Thiếu họ tên ứng viên', 'BULK_ITEM_NO_NAME');
    }

    let candidateId: string;
    let outcome: 'created' | 'linked';

    if (item.resolution === 'LINK_EXISTING') {
      if (!item.duplicateOfCandidateId) {
        throw new BadRequestError('Thiếu ứng viên để liên kết', 'BULK_ITEM_NO_LINK_TARGET');
      }
      candidateId = item.duplicateOfCandidateId;
      outcome = 'linked';
    } else {
      try {
        const candidate = await candidateService.create(tenantId, {
          fullName: reviewed.fullName,
          email: reviewed.email,
          phone: reviewed.phone,
          currentTitle: reviewed.currentTitle,
          totalYearsExp: reviewed.totalYearsExp,
          skills: reviewed.skills,
          links: reviewed.links as Prisma.InputJsonValue | undefined,
          source: 'SOURCED',
          // Dedup already ran at parse time; bypass the soft name-dup block.
          force: true,
        });
        candidateId = candidate.id;
        outcome = 'created';
      } catch (err) {
        // Race: a hard-key duplicate appeared between parse and confirm. Degrade
        // to linking that existing candidate rather than failing the item.
        const code = err instanceof AppError ? err.code : '';
        if (code === 'CANDIDATE_DUPLICATE_EMAIL' || code === 'CANDIDATE_DUPLICATE_PHONE') {
          const existingId = await this.resolveExistingCandidate(tenantId, reviewed);
          if (!existingId) throw err;
          candidateId = existingId;
          outcome = 'linked';
        } else {
          throw err;
        }
      }
    }

    await candidateAttachmentRepository.create({
      candidateId,
      kind: 'CV',
      fileName: item.fileName,
      fileUrl: item.fileUrl,
      parsedData: (item.parsedData as Prisma.InputJsonValue | null) ?? {},
    });
    if (item.rawCvText) {
      await candidateAttachmentRepository.updateCandidateRawText(candidateId, item.rawCvText);
    }

    // Auto-apply into the job's first stage. An existing active application is not
    // an error here — the candidate is simply already in this pipeline.
    let applicationId: string | null = null;
    try {
      const app = await applicationService.create(tenantId, userId, {
        candidateId,
        jobId,
        source: 'SOURCED',
      });
      applicationId = app.id;
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== 'APPLICATION_DUPLICATE_ACTIVE') throw err;
    }

    const finalResolution: BulkImportItemResolution =
      outcome === 'created' ? 'NEW' : 'LINK_EXISTING';
    await bulkImportRepository.markItemConfirmed(item.id, {
      candidateId,
      applicationId,
      resolution: finalResolution,
    });

    return outcome;
  },

  /** Find the candidate a raced NEW collided with, by normalized email then phone. */
  async resolveExistingCandidate(
    tenantId: string,
    reviewed: Partial<ParsedResume>
  ): Promise<string | null> {
    const email = reviewed.email?.trim().toLowerCase();
    if (email) {
      const byEmail = await candidateRepository.findByEmail(tenantId, email);
      if (byEmail) return byEmail.id;
    }
    const phone = normalizePhone(reviewed.phone);
    if (phone) {
      const byPhone = await candidateRepository.findByPhone(tenantId, phone);
      if (byPhone) return byPhone.id;
    }
    return null;
  },
};
