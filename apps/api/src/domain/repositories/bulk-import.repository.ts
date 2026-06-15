import { Prisma } from '@prisma/client';
import type {
  BulkImportItemStatus,
  BulkImportItemResolution,
  BulkImportStatus,
} from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface CreateBatchItemData {
  fileName: string;
  fileUrl: string;
  mimeType: string;
}

export interface ItemDedup {
  resolution: BulkImportItemResolution;
  duplicateOfCandidateId: string | null;
  duplicateReason: string | null;
}

export const bulkImportRepository = {
  /**
   * Create a batch and its items in a single transaction so a partial failure
   * never leaves orphan files referenced by a half-written batch. totalItems is
   * fixed at creation — items are only ever removed via batch cascade.
   */
  async createBatchWithItems(
    data: { tenantId: string; jobId: string; createdById: string },
    items: CreateBatchItemData[]
  ) {
    return db.bulkImportBatch.create({
      data: {
        tenantId: data.tenantId,
        jobId: data.jobId,
        createdById: data.createdById,
        totalItems: items.length,
        items: {
          create: items.map((it) => ({
            fileName: it.fileName,
            fileUrl: it.fileUrl,
            mimeType: it.mimeType,
          })),
        },
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
  },

  // Tenant scoping is enforced on the batch so an item id alone can't reach
  // another tenant's data.
  async findBatchById(batchId: string, tenantId: string) {
    return db.bulkImportBatch.findFirst({
      where: { id: batchId, tenantId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
  },

  async findItemById(itemId: string, tenantId: string) {
    return db.bulkImportItem.findFirst({
      where: { id: itemId, batch: { tenantId } },
    });
  },

  // Other parsed items in the same batch, for intra-batch dedupe. Excludes the
  // item being processed; only PARSED siblings have a parsedData to compare.
  async findSiblingParsedItems(batchId: string, excludeItemId: string) {
    return db.bulkImportItem.findMany({
      where: { batchId, id: { not: excludeItemId }, status: 'PARSED' },
      select: { id: true, parsedData: true },
    });
  },

  async markItemParsing(itemId: string) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: { parseStatus: 'PROCESSING' },
    });
  },

  /**
   * Persist a successful parse: store hasText/chars/parsed under parsedData,
   * seed reviewedData with the same suggestion (HR edits from there), record the
   * provider, and flip the item to PARSED.
   */
  async markItemParsed(
    itemId: string,
    parsedData: Prisma.InputJsonValue,
    reviewedData: Prisma.InputJsonValue,
    parserProvider: string,
    rawCvText: string | null,
    dedup: ItemDedup
  ) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: {
        status: 'PARSED',
        parseStatus: 'DONE',
        parserProvider,
        parsedData,
        reviewedData,
        rawCvText,
        resolution: dedup.resolution,
        duplicateOfCandidateId: dedup.duplicateOfCandidateId,
        duplicateReason: dedup.duplicateReason,
      },
    });
  },

  async markItemParseFailed(itemId: string, failureReason: string) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: {
        status: 'PARSE_FAILED',
        parseStatus: 'FAILED',
        failureReason,
      },
    });
  },

  async updateItemStatus(itemId: string, status: BulkImportItemStatus) {
    return db.bulkImportItem.update({ where: { id: itemId }, data: { status } });
  },

  // HR's review edit: overwrite the reviewed suggestion and/or change resolution.
  async updateItemReview(
    itemId: string,
    data: { reviewedData?: Prisma.InputJsonValue; resolution?: BulkImportItemResolution }
  ) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: {
        ...(data.reviewedData !== undefined ? { reviewedData: data.reviewedData } : {}),
        ...(data.resolution !== undefined ? { resolution: data.resolution } : {}),
      },
    });
  },

  async countItemsByStatus(batchId: string, status: BulkImportItemStatus) {
    return db.bulkImportItem.count({ where: { batchId, status } });
  },

  async updateBatchStatus(batchId: string, status: BulkImportStatus) {
    return db.bulkImportBatch.update({ where: { id: batchId }, data: { status } });
  },

  // Commit outcome of one item: link the created/matched candidate + application
  // and freeze the item as CONFIRMED.
  async markItemConfirmed(
    itemId: string,
    data: {
      candidateId: string;
      applicationId: string | null;
      resolution: BulkImportItemResolution;
    }
  ) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: {
        status: 'CONFIRMED',
        candidateId: data.candidateId,
        applicationId: data.applicationId,
        resolution: data.resolution,
      },
    });
  },

  // One item failed to commit; record why and move on — sibling items are unaffected.
  async markItemFailed(itemId: string, failureReason: string) {
    return db.bulkImportItem.update({
      where: { id: itemId },
      data: { status: 'FAILED', failureReason },
    });
  },

  /**
   * Atomically claim a REVIEWING batch for confirmation. The status guard in the
   * WHERE clause makes the REVIEWING→CONFIRMED flip a single-winner operation, so
   * a double-submitted confirm (double-click, retry) can't double-create
   * candidates/applications — only the caller that flips it (count === 1) proceeds.
   */
  async claimBatchForConfirm(batchId: string, tenantId: string) {
    const { count } = await db.bulkImportBatch.updateMany({
      where: { id: batchId, tenantId, status: 'REVIEWING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    return count === 1;
  },
};
