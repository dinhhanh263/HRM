import type { ScorecardOverall } from '@prisma/client';
import { SCORECARD_OVERALL_SCORE } from '@hrm/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { scorecardRepository } from '../repositories/scorecard.repository.js';
import { interviewRepository } from '../repositories/interview.repository.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';

type ScorecardRow = Awaited<ReturnType<typeof scorecardRepository.findByInterview>>[number];

interface SubmitScorecardInput {
  overall: ScorecardOverall;
  ratings?: Record<string, number>;
  notes?: string;
}

function toScorecardDto(s: ScorecardRow, myEmployeeId: string | null) {
  return {
    id: s.id,
    interviewId: s.interviewId,
    interviewer: {
      employeeId: s.interviewer.id,
      fullName: s.interviewer.fullName,
      avatar: s.interviewer.avatar,
    },
    overall: s.overall,
    ratings: (s.ratings as Record<string, number> | null) ?? null,
    notes: s.notes,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    isMine: s.interviewerId === myEmployeeId,
  };
}

export const scorecardService = {
  async submit(
    tenantId: string,
    userId: string,
    interviewId: string,
    input: SubmitScorecardInput
  ) {
    const me = await employeeRepository.findByUserId(userId, tenantId);
    if (!me) {
      throw new ValidationError('Current user has no employee profile to submit a scorecard');
    }

    const interview = await interviewRepository.findById(interviewId, tenantId);
    if (!interview) throw new NotFoundError('Interview not found');

    // Only an assigned interviewer may score the candidate — scoring rights are
    // not transferable, even to HR.
    const isInterviewer = interview.interviewers.some((iv) => iv.employee.id === me.id);
    if (!isInterviewer) {
      throw new ForbiddenError('Bạn không phải là người phỏng vấn của buổi này');
    }

    const saved = await scorecardRepository.upsertOwn({
      interviewId,
      interviewerId: me.id,
      overall: input.overall,
      ratings: input.ratings ?? null,
      notes: input.notes ?? null,
    });
    return toScorecardDto(saved, me.id);
  },

  async listForInterview(tenantId: string, userId: string, interviewId: string) {
    const interview = await interviewRepository.findById(interviewId, tenantId);
    if (!interview) throw new NotFoundError('Interview not found');

    const me = await employeeRepository.findByUserId(userId, tenantId);
    const myEmployeeId = me?.id ?? null;
    const isInterviewer =
      !!myEmployeeId && interview.interviewers.some((iv) => iv.employee.id === myEmployeeId);

    const rows = await scorecardRepository.findByInterview(interviewId);
    const totalInterviewers = interview.interviewers.length;
    const submittedCount = rows.length;

    const mineRow = myEmployeeId
      ? rows.find((r) => r.interviewerId === myEmployeeId) ?? null
      : null;
    const mine = mineRow ? toScorecardDto(mineRow, myEmployeeId) : null;

    // No-peek (bias prevention): an interviewer must submit their own scorecard
    // before seeing peers'. A non-interviewer holding application_view (e.g. HR)
    // always reads the submitted results.
    const canViewOthers = isInterviewer ? mine !== null : true;

    const others = canViewOthers
      ? rows
          .filter((r) => r.interviewerId !== myEmployeeId)
          .map((r) => toScorecardDto(r, myEmployeeId))
      : [];

    return {
      interviewId,
      isInterviewer,
      canViewOthers,
      mine,
      others,
      submittedCount,
      totalInterviewers,
    };
  },

  async summaryByApplication(tenantId: string, userId: string, applicationId: string) {
    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    const me = await employeeRepository.findByUserId(userId, tenantId);
    const myEmployeeId = me?.id ?? null;

    const interviews = await interviewRepository.listByApplication(applicationId);
    const cards = await scorecardRepository.listByApplication(applicationId);

    return interviews.map((iv) => {
      const ivCards = cards.filter((c) => c.interviewId === iv.id);
      const totalInterviewers = iv.interviewers.length;
      const submittedCount = ivCards.length;

      // No-peek also applies on the aggregate: an assigned interviewer who has
      // not submitted their own scorecard must not see peers' verdicts or the
      // average here either. Progress counters stay visible.
      const iAmInterviewer =
        !!myEmployeeId && iv.interviewers.some((p) => p.employee.id === myEmployeeId);
      const iSubmitted = !!myEmployeeId && ivCards.some((c) => c.interviewerId === myEmployeeId);
      const redacted = iAmInterviewer && !iSubmitted;

      const averageScore =
        redacted || submittedCount === 0
          ? null
          : ivCards.reduce((sum, c) => sum + SCORECARD_OVERALL_SCORE[c.overall], 0) / submittedCount;
      const recommendations = redacted
        ? []
        : ivCards.map((c) => ({
            interviewer: {
              employeeId: c.interviewer.id,
              fullName: c.interviewer.fullName,
              avatar: c.interviewer.avatar,
            },
            overall: c.overall,
          }));
      return {
        interviewId: iv.id,
        scheduledAt: iv.scheduledAt.toISOString(),
        mode: iv.mode,
        status: iv.status,
        submittedCount,
        totalInterviewers,
        averageScore,
        recommendations,
        redacted,
      };
    });
  },
};
