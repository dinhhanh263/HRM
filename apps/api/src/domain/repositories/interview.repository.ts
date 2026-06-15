import type { Prisma, InterviewMode, InterviewStatus } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface CreateInterviewData {
  tenantId: string;
  applicationId: string;
  stageId: string | null;
  scheduledAt: Date;
  durationMin: number;
  mode: InterviewMode;
  location: string | null;
  meetingUrl: string | null;
  // Employee who scheduled the interview — owner of the activity row.
  createdById: string;
  interviewerIds: string[];
}

const detailInclude = {
  interviewers: {
    include: { employee: { select: { id: true, fullName: true, avatar: true } } },
  },
} satisfies Prisma.InterviewInclude;

// Enriched view for the interviewer's own "upcoming" list: candidate + job so
// the interviewer can prepare without a second round-trip.
const myUpcomingInclude = {
  interviewers: {
    include: { employee: { select: { id: true, fullName: true, avatar: true } } },
  },
  application: {
    select: {
      candidate: { select: { id: true, fullName: true, avatar: true, currentTitle: true } },
      job: { select: { id: true, title: true } },
    },
  },
} satisfies Prisma.InterviewInclude;

export const interviewRepository = {
  async findById(id: string, tenantId: string) {
    return db.interview.findFirst({ where: { id, tenantId }, include: detailInclude });
  },

  async listByApplication(applicationId: string) {
    return db.interview.findMany({
      where: { applicationId },
      include: detailInclude,
      orderBy: { scheduledAt: 'desc' },
    });
  },

  // Scheduled, not-yet-passed interviews the given employee is assigned to,
  // soonest first — the "Sắp tới" group of "PV của tôi".
  async listUpcomingByInterviewer(employeeId: string, tenantId: string, from: Date) {
    return db.interview.findMany({
      where: {
        tenantId,
        status: 'SCHEDULED',
        scheduledAt: { gte: from },
        interviewers: { some: { employeeId } },
      },
      include: myUpcomingInclude,
      orderBy: { scheduledAt: 'asc' },
    });
  },

  // Interviews the employee is assigned to that have already happened and need a
  // scorecard — the "Chờ đánh giá" group. Includes ones already scored (flagged via
  // the embedded scorecards) so the interviewer can revise. CANCELLED / NO_SHOW are
  // excluded: there is nothing to evaluate. Most recent first.
  async listToReviewByInterviewer(employeeId: string, tenantId: string, now: Date) {
    return db.interview.findMany({
      where: {
        tenantId,
        interviewers: { some: { employeeId } },
        OR: [
          { status: 'COMPLETED' },
          { status: 'SCHEDULED', scheduledAt: { lt: now } },
        ],
      },
      include: {
        ...myUpcomingInclude,
        // Only the requester's own scorecard — enough to know if they've submitted,
        // without leaking peers' verdicts (no-peek is enforced in scorecardService).
        scorecards: { where: { interviewerId: employeeId }, select: { id: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  },

  // Create the interview, its interviewer assignments and an INTERVIEW_SCHEDULED
  // activity on the application atomically — the audit trail must never be partial.
  async create(data: CreateInterviewData) {
    return db.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          tenantId: data.tenantId,
          applicationId: data.applicationId,
          stageId: data.stageId,
          scheduledAt: data.scheduledAt,
          durationMin: data.durationMin,
          mode: data.mode,
          location: data.location,
          meetingUrl: data.meetingUrl,
          createdById: data.createdById,
          interviewers: {
            create: data.interviewerIds.map((employeeId) => ({ employeeId })),
          },
        },
      });

      await tx.applicationActivity.create({
        data: {
          applicationId: data.applicationId,
          authorId: data.createdById,
          type: 'INTERVIEW_SCHEDULED',
        },
      });

      return tx.interview.findUniqueOrThrow({
        where: { id: interview.id },
        include: detailInclude,
      });
    });
  },

  async updateStatus(id: string, status: InterviewStatus) {
    return db.interview.update({
      where: { id },
      data: { status },
      include: detailInclude,
    });
  },

  // Stage-gate signal: does this application have at least one completed interview?
  async existsCompletedByApplication(applicationId: string): Promise<boolean> {
    const count = await db.interview.count({
      where: { applicationId, status: 'COMPLETED' },
    });
    return count > 0;
  },

  // Batched variant for the pipeline board: the set of application ids in a job
  // that have a completed interview, in a single query (avoids N+1 over the board).
  async applicationIdsWithCompletedInterview(jobId: string): Promise<Set<string>> {
    const rows = await db.interview.findMany({
      where: { status: 'COMPLETED', application: { jobId } },
      select: { applicationId: true },
      distinct: ['applicationId'],
    });
    return new Set(rows.map((r) => r.applicationId));
  },
};
