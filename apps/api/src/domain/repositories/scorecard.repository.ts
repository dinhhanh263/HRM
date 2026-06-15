import { Prisma } from '@prisma/client';
import type { ScorecardOverall } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface UpsertScorecardData {
  interviewId: string;
  interviewerId: string;
  overall: ScorecardOverall;
  ratings: Prisma.InputJsonValue | null;
  notes: string | null;
}

const detailInclude = {
  interviewer: { select: { id: true, fullName: true, avatar: true } },
} satisfies Prisma.ScorecardInclude;

export const scorecardRepository = {
  async findByInterview(interviewId: string) {
    return db.scorecard.findMany({
      where: { interviewId },
      include: detailInclude,
      orderBy: { submittedAt: 'asc' },
    });
  },

  // All scorecards for every interview on an application — feeds the aggregate.
  async listByApplication(applicationId: string) {
    return db.scorecard.findMany({
      where: { interview: { applicationId } },
      include: detailInclude,
    });
  },

  // Stage-gate signal: does this application have at least one submitted scorecard?
  async existsSubmittedByApplication(applicationId: string): Promise<boolean> {
    const count = await db.scorecard.count({
      where: { interview: { applicationId }, submittedAt: { not: null } },
    });
    return count > 0;
  },

  // Batched variant for the pipeline board: the set of application ids in a job
  // that have at least one submitted scorecard, in a single query.
  async applicationIdsWithSubmittedScorecard(jobId: string): Promise<Set<string>> {
    const rows = await db.scorecard.findMany({
      where: { submittedAt: { not: null }, interview: { application: { jobId } } },
      select: { interview: { select: { applicationId: true } } },
    });
    return new Set(rows.map((r) => r.interview.applicationId));
  },

  // Submit-once: one row per (interview, interviewer); re-submit overwrites and
  // refreshes submittedAt. The unique constraint makes the upsert atomic.
  async upsertOwn(data: UpsertScorecardData) {
    return db.scorecard.upsert({
      where: {
        interviewId_interviewerId: {
          interviewId: data.interviewId,
          interviewerId: data.interviewerId,
        },
      },
      create: {
        interviewId: data.interviewId,
        interviewerId: data.interviewerId,
        overall: data.overall,
        ratings: data.ratings ?? undefined,
        notes: data.notes,
        submittedAt: new Date(),
      },
      update: {
        overall: data.overall,
        ratings: data.ratings ?? Prisma.JsonNull,
        notes: data.notes,
        submittedAt: new Date(),
      },
      include: detailInclude,
    });
  },
};
