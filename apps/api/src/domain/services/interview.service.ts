import type { InterviewMode, InterviewStatus } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { interviewRepository } from '../repositories/interview.repository.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';

type InterviewWithRefs = Awaited<ReturnType<typeof interviewRepository.findById>>;
type MyUpcomingRow = Awaited<
  ReturnType<typeof interviewRepository.listUpcomingByInterviewer>
>[number];
type MyReviewRow = Awaited<
  ReturnType<typeof interviewRepository.listToReviewByInterviewer>
>[number];

interface CreateInterviewInput {
  applicationId: string;
  scheduledAt: string;
  durationMin?: number;
  mode?: InterviewMode;
  location?: string;
  meetingUrl?: string;
  interviewerIds: string[];
}

interface UpdateInterviewStatusInput {
  status: Exclude<InterviewStatus, 'SCHEDULED'>;
}

function toDto(i: NonNullable<InterviewWithRefs>) {
  return {
    id: i.id,
    tenantId: i.tenantId,
    applicationId: i.applicationId,
    stageId: i.stageId,
    scheduledAt: i.scheduledAt.toISOString(),
    durationMin: i.durationMin,
    mode: i.mode,
    location: i.location,
    meetingUrl: i.meetingUrl,
    status: i.status,
    interviewers: i.interviewers.map((iv) => ({
      employeeId: iv.employee.id,
      fullName: iv.employee.fullName,
      avatar: iv.employee.avatar,
    })),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

function toMyInterviewDto(i: MyUpcomingRow | MyReviewRow, myScorecardSubmitted: boolean) {
  return {
    ...toDto(i),
    candidate: {
      id: i.application.candidate.id,
      fullName: i.application.candidate.fullName,
      avatar: i.application.candidate.avatar,
      currentTitle: i.application.candidate.currentTitle,
    },
    job: {
      id: i.application.job.id,
      title: i.application.job.title,
    },
    myScorecardSubmitted,
  };
}

export const interviewService = {
  async listByApplication(tenantId: string, applicationId: string) {
    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    const rows = await interviewRepository.listByApplication(applicationId);
    return rows.map(toDto);
  },

  async listMine(tenantId: string, userId: string) {
    const me = await employeeRepository.findByUserId(userId, tenantId);
    // A user with no employee profile is simply assigned to no interviews.
    if (!me) return { upcoming: [], toReview: [] };

    const now = new Date();
    const [upcomingRows, reviewRows] = await Promise.all([
      interviewRepository.listUpcomingByInterviewer(me.id, tenantId, now),
      interviewRepository.listToReviewByInterviewer(me.id, tenantId, now),
    ]);

    const upcoming = upcomingRows.map((i) => toMyInterviewDto(i, false));
    const toReview = reviewRows
      .map((i) => toMyInterviewDto(i, i.scorecards.length > 0))
      // Surface interviews still awaiting my scorecard before ones I've already done.
      .sort((a, b) => Number(a.myScorecardSubmitted) - Number(b.myScorecardSubmitted));

    return { upcoming, toReview };
  },

  async create(tenantId: string, userId: string, input: CreateInterviewInput) {
    const creator = await employeeRepository.findByUserId(userId, tenantId);
    if (!creator) {
      throw new ValidationError('Current user has no employee profile to schedule the interview');
    }

    const application = await applicationRepository.findById(input.applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    // Scheduling an interview is part of moving a live candidate forward; a closed
    // application is frozen, so it cannot receive new interviews.
    if (application.status !== 'ACTIVE') {
      throw new ConflictError('Hồ sơ đã đóng, không thể lên lịch phỏng vấn', 'APPLICATION_NOT_ACTIVE');
    }

    // De-duplicate then verify every assigned interviewer belongs to the tenant —
    // a foreign or unknown employee id must not leak across tenants.
    const uniqueIds = [...new Set(input.interviewerIds)];
    const existing = await employeeRepository.findExistingIds(uniqueIds, tenantId);
    if (existing.length !== uniqueIds.length) {
      throw new ValidationError('One or more interviewers are not valid employees of this tenant');
    }

    const created = await interviewRepository.create({
      tenantId,
      applicationId: input.applicationId,
      stageId: application.currentStageId,
      scheduledAt: new Date(input.scheduledAt),
      durationMin: input.durationMin ?? 60,
      mode: input.mode ?? 'ONSITE',
      location: input.location ?? null,
      meetingUrl: input.meetingUrl ?? null,
      createdById: creator.id,
      interviewerIds: uniqueIds,
    });
    return toDto(created);
  },

  async updateStatus(
    tenantId: string,
    applicationId: string,
    interviewId: string,
    input: UpdateInterviewStatusInput
  ) {
    const interview = await interviewRepository.findById(interviewId, tenantId);
    if (!interview || interview.applicationId !== applicationId) {
      throw new NotFoundError('Interview not found');
    }

    // Only a SCHEDULED interview can transition; once it has an outcome the
    // record is frozen so it stays an honest log of what happened.
    if (interview.status !== 'SCHEDULED') {
      throw new ConflictError('Phỏng vấn đã kết thúc, không thể đổi trạng thái', 'INTERVIEW_NOT_SCHEDULED');
    }

    const updated = await interviewRepository.updateStatus(interviewId, input.status);
    return toDto(updated);
  },
};
