import { Prisma } from '@prisma/client';
import type { CandidateSource, RejectionReason } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { ConflictError } from '../../shared/errors/AppError.js';

export interface CreateApplicationData {
  tenantId: string;
  candidateId: string;
  jobId: string;
  currentStageId: string;
  source: CandidateSource;
  // Employee who created the application — owner of the initial stage-history row.
  createdById: string;
}

export interface MoveApplicationData {
  applicationId: string;
  fromStageId: string;
  toStageId: string;
  // Employee performing the move — owner of the stage-history row and activity.
  changedById: string;
  note?: string;
}

export interface RejectApplicationData {
  applicationId: string;
  rejectionReason: RejectionReason;
  // Employee performing the disposition — owner of the activity row.
  authorId: string;
  note?: string;
}

export interface HireApplicationData {
  applicationId: string;
  fromStageId: string;
  hiredStageId: string;
  // Employee performing the hire — owner of the stage-history row and activity.
  changedById: string;
  note?: string;
}

export interface WithdrawApplicationData {
  applicationId: string;
  authorId: string;
  note?: string;
}

export interface CreateNoteData {
  applicationId: string;
  authorId: string;
  body: string;
}

const detailInclude = {
  currentStage: true,
  candidate: {
    select: { id: true, fullName: true, email: true, avatar: true, currentTitle: true },
  },
  job: {
    select: { id: true, title: true, status: true },
  },
} satisfies Prisma.ApplicationInclude;

const activityInclude = {
  author: { select: { id: true, fullName: true, avatar: true } },
} satisfies Prisma.ApplicationActivityInclude;

export const applicationRepository = {
  // The one active application per (candidate, job) — the uniqueness invariant the
  // service enforces. Returns null when the candidate can be added to the job.
  async findActive(tenantId: string, candidateId: string, jobId: string) {
    return db.application.findFirst({
      where: { tenantId, candidateId, jobId, status: 'ACTIVE' },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.application.findFirst({ where: { id, tenantId }, include: detailInclude });
  },

  async listByCandidate(candidateId: string, tenantId: string) {
    return db.application.findMany({
      where: { candidateId, tenantId },
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async listByJob(jobId: string, tenantId: string) {
    return db.application.findMany({
      where: { jobId, tenantId },
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  // The full activity feed (notes + system events). Newest first so the UI can
  // render a reverse-chronological timeline without re-sorting.
  async listActivities(applicationId: string) {
    return db.applicationActivity.findMany({
      where: { applicationId },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  // A standalone internal note. Unlike disposition/move activities this has no
  // side effects on the application, so no transaction is needed.
  async createNote(data: CreateNoteData) {
    return db.applicationActivity.create({
      data: {
        applicationId: data.applicationId,
        authorId: data.authorId,
        type: 'NOTE',
        body: data.body,
      },
      include: activityInclude,
    });
  },

  // Create the application, its opening stage-history row (from=null) and a
  // system activity entry atomically so the audit trail is never partial.
  async create(data: CreateApplicationData) {
    try {
      return await db.$transaction(async (tx) => {
        const application = await tx.application.create({
          data: {
            tenantId: data.tenantId,
            candidateId: data.candidateId,
            jobId: data.jobId,
            currentStageId: data.currentStageId,
            source: data.source,
          },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId: application.id,
            fromStageId: null,
            toStageId: data.currentStageId,
            changedById: data.createdById,
          },
        });

        await tx.applicationActivity.create({
          data: {
            applicationId: application.id,
            authorId: data.createdById,
            type: 'APPLIED',
          },
        });

        return tx.application.findUniqueOrThrow({
          where: { id: application.id },
          include: detailInclude,
        });
      });
    } catch (err) {
      // The partial unique index (uniq_active_application) is the authoritative
      // guard against two concurrent inserts racing past the service pre-check.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          'Ứng viên đã có hồ sơ đang xử lý ở vị trí này',
          'APPLICATION_DUPLICATE_ACTIVE'
        );
      }
      throw err;
    }
  },

  // Move the application to another stage and record the transition + activity
  // atomically. Every move appends one history row — the basis for velocity
  // analytics — so a partial write must never leave the audit trail short.
  async move(data: MoveApplicationData) {
    return db.$transaction(async (tx) => {
      // Compare-and-swap: the move only applies if the row is still ACTIVE and
      // still sitting at fromStageId. Two concurrent moves both pass the service's
      // read-time guard, so this is the only place that can serialize them — the
      // loser matches 0 rows and is rejected before any history is written.
      const { count } = await tx.application.updateMany({
        where: { id: data.applicationId, status: 'ACTIVE', currentStageId: data.fromStageId },
        data: { currentStageId: data.toStageId },
      });
      if (count === 0) {
        throw new ConflictError(
          'Hồ sơ vừa thay đổi, vui lòng tải lại',
          'APPLICATION_STAGE_CONFLICT'
        );
      }

      await tx.applicationStageHistory.create({
        data: {
          applicationId: data.applicationId,
          fromStageId: data.fromStageId,
          toStageId: data.toStageId,
          changedById: data.changedById,
          note: data.note ?? null,
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId: data.applicationId,
          authorId: data.changedById,
          type: 'STAGE_CHANGED',
          body: data.note ?? null,
        },
      });

      return tx.application.findUniqueOrThrow({
        where: { id: data.applicationId },
        include: detailInclude,
      });
    });
  },

  // Reject closes the application but freezes its stage: the funnel must still
  // show where the candidate dropped. Records the reason + a disposition activity.
  async reject(data: RejectApplicationData) {
    return db.$transaction(async (tx) => {
      // Only an ACTIVE row may be closed — guards against a concurrent disposition
      // double-closing the same application.
      const { count } = await tx.application.updateMany({
        where: { id: data.applicationId, status: 'ACTIVE' },
        data: { status: 'REJECTED', rejectionReason: data.rejectionReason },
      });
      if (count === 0) {
        throw new ConflictError('Hồ sơ đã đóng, không thể thao tác', 'APPLICATION_NOT_ACTIVE');
      }

      await tx.applicationActivity.create({
        data: {
          applicationId: data.applicationId,
          authorId: data.authorId,
          type: 'REJECTED',
          body: data.note ?? null,
        },
      });

      return tx.application.findUniqueOrThrow({
        where: { id: data.applicationId },
        include: detailInclude,
      });
    });
  },

  // Hire moves the application onto the pipeline's HIRED stage and closes it.
  // The transition is recorded in stage history so the trail ends at HIRED.
  async hire(data: HireApplicationData) {
    return db.$transaction(async (tx) => {
      // Only an ACTIVE row may be hired — guards against a concurrent disposition
      // double-closing the same application.
      const { count } = await tx.application.updateMany({
        where: { id: data.applicationId, status: 'ACTIVE' },
        data: { status: 'HIRED', currentStageId: data.hiredStageId },
      });
      if (count === 0) {
        throw new ConflictError('Hồ sơ đã đóng, không thể thao tác', 'APPLICATION_NOT_ACTIVE');
      }

      await tx.applicationStageHistory.create({
        data: {
          applicationId: data.applicationId,
          fromStageId: data.fromStageId,
          toStageId: data.hiredStageId,
          changedById: data.changedById,
          note: data.note ?? null,
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId: data.applicationId,
          authorId: data.changedById,
          type: 'HIRED',
          body: data.note ?? null,
        },
      });

      return tx.application.findUniqueOrThrow({
        where: { id: data.applicationId },
        include: detailInclude,
      });
    });
  },

  // Withdraw closes the application (candidate pulled out) keeping its stage.
  async withdraw(data: WithdrawApplicationData) {
    return db.$transaction(async (tx) => {
      // Only an ACTIVE row may be withdrawn — guards against a concurrent
      // disposition double-closing the same application.
      const { count } = await tx.application.updateMany({
        where: { id: data.applicationId, status: 'ACTIVE' },
        data: { status: 'WITHDRAWN' },
      });
      if (count === 0) {
        throw new ConflictError('Hồ sơ đã đóng, không thể thao tác', 'APPLICATION_NOT_ACTIVE');
      }

      await tx.applicationActivity.create({
        data: {
          applicationId: data.applicationId,
          authorId: data.authorId,
          type: 'WITHDRAWN',
          body: data.note ?? null,
        },
      });

      return tx.application.findUniqueOrThrow({
        where: { id: data.applicationId },
        include: detailInclude,
      });
    });
  },
};
