import type { CandidateSource, RejectionReason } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { applicationRepository } from '../repositories/application.repository.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { jobRepository } from '../repositories/job.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { interviewRepository } from '../repositories/interview.repository.js';
import { scorecardRepository } from '../repositories/scorecard.repository.js';
import { assertStageTransitionAllowed } from '../recruitment/stage-transition.policy.js';

type ApplicationWithRefs = Awaited<ReturnType<typeof applicationRepository.findById>>;
type ActivityWithAuthor = Awaited<
  ReturnType<typeof applicationRepository.listActivities>
>[number];

interface CreateApplicationInput {
  candidateId: string;
  jobId: string;
  source?: CandidateSource;
}

interface MoveApplicationInput {
  toStageId: string;
  note?: string;
  // Opt-in override of a soft stage gate; only effective with actorCanForce.
  force?: boolean;
}

interface RejectApplicationInput {
  rejectionReason: RejectionReason;
  note?: string;
}

interface DispositionInput {
  note?: string;
}

interface CreateNoteInput {
  body: string;
}

// Shared precondition for every terminal disposition (reject/hire/withdraw):
// the actor must own an Employee, the application must exist and still be open.
async function loadActiveForDisposition(tenantId: string, userId: string, applicationId: string) {
  const actor = await employeeRepository.findByUserId(userId, tenantId);
  if (!actor) {
    throw new ValidationError('Current user has no employee profile to act on the application');
  }

  const application = await applicationRepository.findById(applicationId, tenantId);
  if (!application) throw new NotFoundError('Application not found');

  // Once an application is hired, rejected or withdrawn it is frozen — a closed
  // record cannot be re-dispositioned.
  if (application.status !== 'ACTIVE') {
    throw new ConflictError('Hồ sơ đã đóng, không thể thao tác', 'APPLICATION_NOT_ACTIVE');
  }

  return { actor, application };
}

function toDto(a: NonNullable<ApplicationWithRefs>) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    candidateId: a.candidateId,
    jobId: a.jobId,
    currentStageId: a.currentStageId,
    status: a.status,
    source: a.source,
    rejectionReason: a.rejectionReason,
    appliedAt: a.appliedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    currentStage: {
      id: a.currentStage.id,
      name: a.currentStage.name,
      order: a.currentStage.order,
      type: a.currentStage.type,
    },
    candidate: {
      id: a.candidate.id,
      fullName: a.candidate.fullName,
      email: a.candidate.email,
      avatar: a.candidate.avatar,
      currentTitle: a.candidate.currentTitle,
    },
    job: {
      id: a.job.id,
      title: a.job.title,
      status: a.job.status,
    },
  };
}

function toActivityDto(a: ActivityWithAuthor) {
  return {
    id: a.id,
    type: a.type as
      | 'APPLIED'
      | 'STAGE_CHANGED'
      | 'NOTE'
      | 'REJECTED'
      | 'HIRED'
      | 'WITHDRAWN',
    body: a.body,
    author: a.author
      ? { id: a.author.id, fullName: a.author.fullName, avatar: a.author.avatar }
      : null,
    createdAt: a.createdAt.toISOString(),
  };
}

export const applicationService = {
  async listByCandidate(candidateId: string, tenantId: string) {
    const candidate = await candidateRepository.findById(candidateId, tenantId);
    if (!candidate) throw new NotFoundError('Candidate not found');
    const rows = await applicationRepository.listByCandidate(candidateId, tenantId);
    return rows.map(toDto);
  },

  async listByJob(jobId: string, tenantId: string) {
    const job = await jobRepository.findById(jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');
    const rows = await applicationRepository.listByJob(jobId, tenantId);

    // Batch the two OFFER-gate signals across the whole board in one query each,
    // then intersect — an application clears the gate only when it has BOTH a
    // completed interview AND a submitted scorecard. Avoids N+1 over the cards.
    const [withInterview, withScorecard] = await Promise.all([
      interviewRepository.applicationIdsWithCompletedInterview(jobId),
      scorecardRepository.applicationIdsWithSubmittedScorecard(jobId),
    ]);
    return rows.map((a) => ({
      ...toDto(a),
      offerGateMet: withInterview.has(a.id) && withScorecard.has(a.id),
    }));
  },

  async getById(applicationId: string, tenantId: string) {
    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');
    return toDto(application);
  },

  async create(tenantId: string, userId: string, input: CreateApplicationInput) {
    const creator = await employeeRepository.findByUserId(userId, tenantId);
    if (!creator) {
      throw new ValidationError('Current user has no employee profile to own the application');
    }

    const candidate = await candidateRepository.findById(input.candidateId, tenantId);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const job = await jobRepository.findById(input.jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');

    // A cancelled job no longer accepts new applicants.
    if (job.status === 'CANCELLED') {
      throw new ConflictError('Vị trí đã hủy, không thể thêm ứng viên', 'JOB_NOT_ACCEPTING');
    }

    // One active application per (candidate, job) — the core invariant.
    const active = await applicationRepository.findActive(tenantId, input.candidateId, input.jobId);
    if (active) {
      throw new ConflictError(
        'Ứng viên đã có hồ sơ đang xử lý ở vị trí này',
        'APPLICATION_DUPLICATE_ACTIVE'
      );
    }

    // The pipeline starts at the stage with the lowest order (stages come sorted).
    const firstStage = job.stages[0];
    if (!firstStage) {
      throw new ValidationError('Job has no pipeline stages');
    }

    const created = await applicationRepository.create({
      tenantId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      currentStageId: firstStage.id,
      source: input.source ?? candidate.source,
      createdById: creator.id,
    });
    return toDto(created);
  },

  async move(
    tenantId: string,
    userId: string,
    applicationId: string,
    input: MoveApplicationInput,
    actorCanForce = false
  ) {
    const mover = await employeeRepository.findByUserId(userId, tenantId);
    if (!mover) {
      throw new ValidationError('Current user has no employee profile to move the application');
    }

    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    // Only an open application moves through the funnel; once it's hired,
    // rejected or withdrawn its stage is frozen as the record of where it ended.
    if (application.status !== 'ACTIVE') {
      throw new ConflictError(
        'Hồ sơ đã đóng, không thể chuyển bước',
        'APPLICATION_NOT_ACTIVE'
      );
    }

    // The target stage must belong to this application's job pipeline.
    const job = await jobRepository.findById(application.jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');
    const targetStage = job.stages.find((s) => s.id === input.toStageId);
    if (!targetStage) {
      throw new ValidationError('Target stage does not belong to this job');
    }

    // A move to the current stage records nothing meaningful — reject it so the
    // history stays a clean trail of real transitions.
    if (input.toStageId === application.currentStageId) {
      throw new ConflictError('Hồ sơ đã ở bước này', 'APPLICATION_STAGE_UNCHANGED');
    }

    // Business policy: block moves into terminal stages and gate OFFER behind a
    // real interview signal (completed interview + submitted scorecard). Only load
    // the signals when the gate could apply — saves two queries on routine moves.
    const signals =
      targetStage.type === 'OFFER'
        ? {
            hasCompletedInterview:
              await interviewRepository.existsCompletedByApplication(applicationId),
            hasSubmittedScorecard:
              await scorecardRepository.existsSubmittedByApplication(applicationId),
          }
        : { hasCompletedInterview: false, hasSubmittedScorecard: false };

    assertStageTransitionAllowed({
      targetStageType: targetStage.type,
      signals,
      actorCanForce,
      force: input.force ?? false,
      note: input.note,
    });

    const moved = await applicationRepository.move({
      applicationId,
      fromStageId: application.currentStageId,
      toStageId: input.toStageId,
      changedById: mover.id,
      note: input.note,
    });
    return toDto(moved);
  },

  async reject(
    tenantId: string,
    userId: string,
    applicationId: string,
    input: RejectApplicationInput
  ) {
    const { actor } = await loadActiveForDisposition(tenantId, userId, applicationId);

    const rejected = await applicationRepository.reject({
      applicationId,
      rejectionReason: input.rejectionReason,
      authorId: actor.id,
      note: input.note,
    });
    return toDto(rejected);
  },

  async hire(tenantId: string, userId: string, applicationId: string, input: DispositionInput) {
    const { actor, application } = await loadActiveForDisposition(tenantId, userId, applicationId);

    // Hire lands the candidate on the pipeline's terminal HIRED stage; a pipeline
    // without one cannot complete a hire.
    const job = await jobRepository.findById(application.jobId, tenantId);
    if (!job) throw new NotFoundError('Job not found');
    const hiredStage = job.stages.find((s) => s.type === 'HIRED');
    if (!hiredStage) {
      throw new ValidationError('Job pipeline has no HIRED stage to complete the hire');
    }

    const hired = await applicationRepository.hire({
      applicationId,
      fromStageId: application.currentStageId,
      hiredStageId: hiredStage.id,
      changedById: actor.id,
      note: input.note,
    });
    return toDto(hired);
  },

  async withdraw(tenantId: string, userId: string, applicationId: string, input: DispositionInput) {
    const { actor } = await loadActiveForDisposition(tenantId, userId, applicationId);

    const withdrawn = await applicationRepository.withdraw({
      applicationId,
      authorId: actor.id,
      note: input.note,
    });
    return toDto(withdrawn);
  },

  // The activity feed is readable for any application regardless of status.
  async listActivities(tenantId: string, applicationId: string) {
    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    const rows = await applicationRepository.listActivities(applicationId);
    return rows.map(toActivityDto);
  },

  // A note can be added to an application in any status (closed records still
  // accept internal commentary), so this deliberately skips the active check.
  async createNote(
    tenantId: string,
    userId: string,
    applicationId: string,
    input: CreateNoteInput
  ) {
    const author = await employeeRepository.findByUserId(userId, tenantId);
    if (!author) {
      throw new ValidationError('Current user has no employee profile to author the note');
    }

    const application = await applicationRepository.findById(applicationId, tenantId);
    if (!application) throw new NotFoundError('Application not found');

    const note = await applicationRepository.createNote({
      applicationId,
      authorId: author.id,
      body: input.body,
    });
    return toActivityDto(note);
  },
};
