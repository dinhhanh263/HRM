import { describe, it, expect, vi, beforeEach } from 'vitest';

const applicationRepoMock = {
  findActive: vi.fn(),
  findById: vi.fn(),
  listByCandidate: vi.fn(),
  listByJob: vi.fn(),
  create: vi.fn(),
  move: vi.fn(),
  reject: vi.fn(),
  hire: vi.fn(),
  withdraw: vi.fn(),
};
const candidateRepoMock = { findById: vi.fn() };
const jobRepoMock = { findById: vi.fn() };
const employeeRepoMock = { findByUserId: vi.fn() };

vi.mock('../../src/domain/repositories/application.repository.js', () => ({
  applicationRepository: applicationRepoMock,
}));
vi.mock('../../src/domain/repositories/candidate.repository.js', () => ({
  candidateRepository: candidateRepoMock,
}));
vi.mock('../../src/domain/repositories/job.repository.js', () => ({
  jobRepository: jobRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { applicationService } = await import('../../src/domain/services/application.service.js');

const TENANT = 'tenant-1';
const USER = 'user-1';

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    tenantId: TENANT,
    title: 'Backend Dev',
    status: 'OPEN',
    stages: [
      { id: 'stage-sourced', name: 'Nguồn', order: 0, type: 'SOURCED' },
      { id: 'stage-screen', name: 'Sàng lọc', order: 1, type: 'SCREEN' },
    ],
    ...over,
  };
}

function createdRow(over: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    tenantId: TENANT,
    candidateId: 'cand-1',
    jobId: 'job-1',
    currentStageId: 'stage-sourced',
    status: 'ACTIVE',
    source: 'REFERRAL',
    rejectionReason: null,
    appliedAt: new Date('2026-06-06T00:00:00Z'),
    createdAt: new Date('2026-06-06T00:00:00Z'),
    updatedAt: new Date('2026-06-06T00:00:00Z'),
    currentStage: { id: 'stage-sourced', name: 'Nguồn', order: 0, type: 'SOURCED' },
    candidate: { id: 'cand-1', fullName: 'Lê Văn A', email: null, avatar: null, currentTitle: null },
    job: { id: 'job-1', title: 'Backend Dev', status: 'OPEN' },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-1' });
  candidateRepoMock.findById.mockResolvedValue({ id: 'cand-1', source: 'REFERRAL' });
  jobRepoMock.findById.mockResolvedValue(jobRow());
  applicationRepoMock.findActive.mockResolvedValue(null);
  applicationRepoMock.create.mockImplementation(async (data: Record<string, unknown>) =>
    createdRow({ currentStageId: data.currentStageId, source: data.source })
  );
});

describe('applicationService.create', () => {
  it('sets currentStage to the first pipeline stage (lowest order)', async () => {
    await applicationService.create(TENANT, USER, { candidateId: 'cand-1', jobId: 'job-1' });
    expect(applicationRepoMock.create).toHaveBeenCalledTimes(1);
    expect(applicationRepoMock.create.mock.calls[0][0].currentStageId).toBe('stage-sourced');
    expect(applicationRepoMock.create.mock.calls[0][0].createdById).toBe('emp-1');
  });

  it('blocks a duplicate active application with 409 APPLICATION_DUPLICATE_ACTIVE', async () => {
    applicationRepoMock.findActive.mockResolvedValue({ id: 'existing' });
    await expect(
      applicationService.create(TENANT, USER, { candidateId: 'cand-1', jobId: 'job-1' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_DUPLICATE_ACTIVE' });
    expect(applicationRepoMock.create).not.toHaveBeenCalled();
  });

  it('falls back to the candidate source when no source is provided', async () => {
    await applicationService.create(TENANT, USER, { candidateId: 'cand-1', jobId: 'job-1' });
    expect(applicationRepoMock.create.mock.calls[0][0].source).toBe('REFERRAL');
  });

  it('honors an explicit source over the candidate default', async () => {
    await applicationService.create(TENANT, USER, {
      candidateId: 'cand-1',
      jobId: 'job-1',
      source: 'JOB_BOARD',
    });
    expect(applicationRepoMock.create.mock.calls[0][0].source).toBe('JOB_BOARD');
  });

  it('rejects creating an application on a cancelled job', async () => {
    jobRepoMock.findById.mockResolvedValue(jobRow({ status: 'CANCELLED' }));
    await expect(
      applicationService.create(TENANT, USER, { candidateId: 'cand-1', jobId: 'job-1' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'JOB_NOT_ACCEPTING' });
    expect(applicationRepoMock.create).not.toHaveBeenCalled();
  });

  it('404s when the candidate does not exist in the tenant', async () => {
    candidateRepoMock.findById.mockResolvedValue(null);
    await expect(
      applicationService.create(TENANT, USER, { candidateId: 'missing', jobId: 'job-1' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects when the current user has no employee profile', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue(null);
    await expect(
      applicationService.create(TENANT, USER, { candidateId: 'cand-1', jobId: 'job-1' })
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('applicationService.move', () => {
  beforeEach(() => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', currentStageId: 'stage-sourced', status: 'ACTIVE' })
    );
    applicationRepoMock.move.mockImplementation(async (data: Record<string, unknown>) =>
      createdRow({ currentStageId: data.toStageId })
    );
  });

  it('moves to a valid stage of the job and records the from/to transition', async () => {
    await applicationService.move(TENANT, USER, 'app-1', { toStageId: 'stage-screen' });
    expect(applicationRepoMock.move).toHaveBeenCalledTimes(1);
    expect(applicationRepoMock.move.mock.calls[0][0]).toMatchObject({
      applicationId: 'app-1',
      fromStageId: 'stage-sourced',
      toStageId: 'stage-screen',
      changedById: 'emp-1',
    });
  });

  it('forwards an optional note to the history row', async () => {
    await applicationService.move(TENANT, USER, 'app-1', {
      toStageId: 'stage-screen',
      note: 'Qua vòng sàng lọc',
    });
    expect(applicationRepoMock.move.mock.calls[0][0].note).toBe('Qua vòng sàng lọc');
  });

  it('rejects a move to a stage that does not belong to the job (422)', async () => {
    await expect(
      applicationService.move(TENANT, USER, 'app-1', { toStageId: 'stage-foreign' })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(applicationRepoMock.move).not.toHaveBeenCalled();
  });

  it('rejects a no-op move to the current stage (409 APPLICATION_STAGE_UNCHANGED)', async () => {
    await expect(
      applicationService.move(TENANT, USER, 'app-1', { toStageId: 'stage-sourced' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_STAGE_UNCHANGED' });
    expect(applicationRepoMock.move).not.toHaveBeenCalled();
  });

  it('rejects moving an application that is no longer active (409 APPLICATION_NOT_ACTIVE)', async () => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', currentStageId: 'stage-sourced', status: 'REJECTED' })
    );
    await expect(
      applicationService.move(TENANT, USER, 'app-1', { toStageId: 'stage-screen' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_NOT_ACTIVE' });
    expect(applicationRepoMock.move).not.toHaveBeenCalled();
  });

  it('404s when the application does not exist in the tenant', async () => {
    applicationRepoMock.findById.mockResolvedValue(null);
    await expect(
      applicationService.move(TENANT, USER, 'missing', { toStageId: 'stage-screen' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applicationService.reject', () => {
  beforeEach(() => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', currentStageId: 'stage-screen', status: 'ACTIVE' })
    );
    applicationRepoMock.reject.mockImplementation(async () =>
      createdRow({ status: 'REJECTED', currentStageId: 'stage-screen', rejectionReason: 'CULTURE_FIT' })
    );
  });

  it('rejects keeping the current stage and recording the reason + author', async () => {
    await applicationService.reject(TENANT, USER, 'app-1', {
      rejectionReason: 'CULTURE_FIT',
      note: 'Không hợp văn hoá',
    });
    expect(applicationRepoMock.reject).toHaveBeenCalledTimes(1);
    expect(applicationRepoMock.reject.mock.calls[0][0]).toMatchObject({
      applicationId: 'app-1',
      rejectionReason: 'CULTURE_FIT',
      note: 'Không hợp văn hoá',
      authorId: 'emp-1',
    });
    // Reject never moves the stage — no toStageId is involved.
    expect(applicationRepoMock.reject.mock.calls[0][0]).not.toHaveProperty('toStageId');
  });

  it('blocks rejecting an application that is already closed (409 APPLICATION_NOT_ACTIVE)', async () => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', status: 'HIRED' })
    );
    await expect(
      applicationService.reject(TENANT, USER, 'app-1', { rejectionReason: 'OTHER' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_NOT_ACTIVE' });
    expect(applicationRepoMock.reject).not.toHaveBeenCalled();
  });

  it('404s when the application does not exist', async () => {
    applicationRepoMock.findById.mockResolvedValue(null);
    await expect(
      applicationService.reject(TENANT, USER, 'missing', { rejectionReason: 'OTHER' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applicationService.hire', () => {
  beforeEach(() => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', currentStageId: 'stage-screen', status: 'ACTIVE' })
    );
    // The job exposes a HIRED-type stage the hire action must resolve.
    jobRepoMock.findById.mockResolvedValue(
      jobRow({
        stages: [
          { id: 'stage-sourced', name: 'Nguồn', order: 0, type: 'SOURCED' },
          { id: 'stage-screen', name: 'Sàng lọc', order: 1, type: 'SCREEN' },
          { id: 'stage-hired', name: 'Đã tuyển', order: 2, type: 'HIRED' },
        ],
      })
    );
    applicationRepoMock.hire.mockImplementation(async () =>
      createdRow({ status: 'HIRED', currentStageId: 'stage-hired' })
    );
  });

  it('moves the application to the pipeline HIRED stage and closes it as HIRED', async () => {
    await applicationService.hire(TENANT, USER, 'app-1', { note: 'Chốt offer' });
    expect(applicationRepoMock.hire).toHaveBeenCalledTimes(1);
    expect(applicationRepoMock.hire.mock.calls[0][0]).toMatchObject({
      applicationId: 'app-1',
      fromStageId: 'stage-screen',
      hiredStageId: 'stage-hired',
      changedById: 'emp-1',
      note: 'Chốt offer',
    });
  });

  it('422s when the pipeline has no HIRED stage', async () => {
    jobRepoMock.findById.mockResolvedValue(
      jobRow({
        stages: [
          { id: 'stage-sourced', name: 'Nguồn', order: 0, type: 'SOURCED' },
          { id: 'stage-screen', name: 'Sàng lọc', order: 1, type: 'SCREEN' },
        ],
      })
    );
    await expect(
      applicationService.hire(TENANT, USER, 'app-1', {})
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(applicationRepoMock.hire).not.toHaveBeenCalled();
  });

  it('blocks hiring an application that is already closed (409 APPLICATION_NOT_ACTIVE)', async () => {
    applicationRepoMock.findById.mockResolvedValue(createdRow({ id: 'app-1', status: 'WITHDRAWN' }));
    await expect(
      applicationService.hire(TENANT, USER, 'app-1', {})
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_NOT_ACTIVE' });
    expect(applicationRepoMock.hire).not.toHaveBeenCalled();
  });
});

describe('applicationService.withdraw', () => {
  beforeEach(() => {
    applicationRepoMock.findById.mockResolvedValue(
      createdRow({ id: 'app-1', currentStageId: 'stage-screen', status: 'ACTIVE' })
    );
    applicationRepoMock.withdraw.mockImplementation(async () =>
      createdRow({ status: 'WITHDRAWN', currentStageId: 'stage-screen' })
    );
  });

  it('withdraws keeping the current stage and recording the author', async () => {
    await applicationService.withdraw(TENANT, USER, 'app-1', { note: 'Ứng viên rút' });
    expect(applicationRepoMock.withdraw).toHaveBeenCalledTimes(1);
    expect(applicationRepoMock.withdraw.mock.calls[0][0]).toMatchObject({
      applicationId: 'app-1',
      note: 'Ứng viên rút',
      authorId: 'emp-1',
    });
  });

  it('blocks withdrawing an application that is already closed (409 APPLICATION_NOT_ACTIVE)', async () => {
    applicationRepoMock.findById.mockResolvedValue(createdRow({ id: 'app-1', status: 'REJECTED' }));
    await expect(
      applicationService.withdraw(TENANT, USER, 'app-1', {})
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPLICATION_NOT_ACTIVE' });
    expect(applicationRepoMock.withdraw).not.toHaveBeenCalled();
  });
});
