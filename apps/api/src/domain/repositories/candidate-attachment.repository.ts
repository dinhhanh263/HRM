import { Prisma } from '@prisma/client';
import type { AttachmentKind } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface CreateAttachmentData {
  candidateId: string;
  kind: AttachmentKind;
  fileName: string;
  fileUrl: string;
  // Text-extraction outcome, stored under parsed_data. The resume parser
  // (Task 3.3) later enriches/overwrites this with structured fields.
  parsedData: Prisma.InputJsonValue;
}

export const candidateAttachmentRepository = {
  async findByCandidate(candidateId: string) {
    return db.candidateAttachment.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Tenant scoping is enforced through the parent candidate relation so a
  // recruiter can never reach another tenant's files by guessing an id.
  async findByIdScoped(id: string, candidateId: string, tenantId: string) {
    return db.candidateAttachment.findFirst({
      where: { id, candidateId, candidate: { tenantId } },
    });
  },

  async create(data: CreateAttachmentData) {
    return db.candidateAttachment.create({
      data: {
        candidateId: data.candidateId,
        kind: data.kind,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        parsedData: data.parsedData,
      },
    });
  },

  // The candidate's rawCvText mirrors the most recently uploaded CV so it can be
  // searched (Task 3.4) without joining attachments.
  async updateCandidateRawText(candidateId: string, rawCvText: string | null) {
    return db.candidate.update({
      where: { id: candidateId },
      data: { rawCvText },
    });
  },

  /** Flag an attachment as actively parsing so the UI can show a spinner. */
  async markParsing(id: string) {
    return db.candidateAttachment.update({
      where: { id },
      data: { parseStatus: 'PROCESSING' },
    });
  },

  /**
   * Persist a successful parse: merge the structured result into parsed_data
   * (preserving the upload-time hasText/chars), record the provider + time, and
   * flip status to DONE.
   */
  async markParsed(
    id: string,
    parsedData: Prisma.InputJsonValue,
    parserProvider: string
  ) {
    return db.candidateAttachment.update({
      where: { id },
      data: {
        parseStatus: 'DONE',
        parserProvider,
        parsedData,
        parsedAt: new Date(),
      },
    });
  },

  /** Flag a failed parse so the recruiter can retry; CV stays usable regardless. */
  async markParseFailed(id: string) {
    return db.candidateAttachment.update({
      where: { id },
      data: { parseStatus: 'FAILED', parsedAt: new Date() },
    });
  },
};
