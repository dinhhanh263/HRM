import { describe, it, expect, vi, beforeEach } from 'vitest';

const interviewRepoMock = {
  findById: vi.fn(),
  listByApplication: vi.fn(),
  listUpcomingByInterviewer: vi.fn(),
  listToReviewByInterviewer: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
};
const applicationRepoMock = { findById: vi.fn() };
const employeeRepoMock = { findByUserId: vi.fn(), findExistingIds: vi.fn() };

vi.mock('../../src/domain/repositories/interview.repository.js', () => ({
  interviewRepository: interviewRepoMock,
}));
vi.mock('../../src/domain/repositories/application.repository.js', () => ({
  applicationRepository: applicationRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { interviewService } = await import('../../src/domain/services/interview.service.js');

const TENANT = 'tenant-1';
const USER = 'user-1';

function interviewRow(over: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    tenantId: TENANT,
    applicationId: 'app-1',
    stageId: 'stage-interview',
    scheduledAt: new Date('2026-06-10T09:00:00Z'),
    durationMin: 60,
    mode: 'ONSITE',
    location: 'Phòng họp A',
    meetingUrl: null,
    status: 'SCHEDULED',
    interviewers: [
      { employee: { id: 'emp-2', fullName: 'Người PV', avatar: null } },
    ],
    createdAt: new Date('2026-06-06T00:00:00Z'),
    updatedAt: new Date('2026-06-06T00:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-1' });
  applicationRepoMock.findById.mockResolvedValue({
    id: 'app-1',
    tenantId: TENANT,
    status: 'ACTIVE',
    currentStageId: 'stage-interview',
  });
  employeeRepoMock.findExistingIds.mockImplementation(async (ids: string[]) => ids);
  interviewRepoMock.create.mockResolvedValue(interviewRow());
});

describe('interviewService.create', () => {
  it('schedules an interview and stamps the application current stage', async () => {
    await interviewService.create(TENANT, USER, {
      applicationId: 'app-1',
      scheduledAt: '2026-06-10T09:00:00Z',
      interviewerIds: ['emp-2'],
    });
    expect(interviewRepoMock.create).toHaveBeenCalledTimes(1);
    const arg = interviewRepoMock.create.mock.calls[0][0];
    expect(arg.createdById).toBe('emp-1');
    expect(arg.stageId).toBe('stage-interview');
    expect(arg.durationMin).toBe(60);
    expect(arg.mode).toBe('ONSITE');
    expect(arg.interviewerIds).toEqual(['emp-2']);
  });

  it('de-duplicates interviewer ids before persisting', async () => {
    employeeRepoMock.findExistingIds.mockResolvedValueOnce(['emp-2', 'emp-3']);
    await interviewService.create(TENANT, USER, {
      applicationId: 'app-1',
      scheduledAt: '2026-06-10T09:00:00Z',
      interviewerIds: ['emp-2', 'emp-2', 'emp-3'],
    });
    const arg = interviewRepoMock.create.mock.calls[0][0];
    expect(arg.interviewerIds).toEqual(['emp-2', 'emp-3']);
  });

  it('rejects an interviewer that does not belong to the tenant', async () => {
    employeeRepoMock.findExistingIds.mockResolvedValueOnce(['emp-2']); // emp-9 missing
    await expect(
      interviewService.create(TENANT, USER, {
        applicationId: 'app-1',
        scheduledAt: '2026-06-10T09:00:00Z',
        interviewerIds: ['emp-2', 'emp-9'],
      })
    ).rejects.toThrow(/not valid employees/);
    expect(interviewRepoMock.create).not.toHaveBeenCalled();
  });

  it('blocks scheduling on a closed application with 409', async () => {
    applicationRepoMock.findById.mockResolvedValueOnce({
      id: 'app-1',
      tenantId: TENANT,
      status: 'HIRED',
      currentStageId: 'stage-hired',
    });
    await expect(
      interviewService.create(TENANT, USER, {
        applicationId: 'app-1',
        scheduledAt: '2026-06-10T09:00:00Z',
        interviewerIds: ['emp-2'],
      })
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_ACTIVE' });
  });

  it('throws NotFound when the application does not exist', async () => {
    applicationRepoMock.findById.mockResolvedValueOnce(null);
    await expect(
      interviewService.create(TENANT, USER, {
        applicationId: 'missing',
        scheduledAt: '2026-06-10T09:00:00Z',
        interviewerIds: ['emp-2'],
      })
    ).rejects.toThrow('Application not found');
  });
});

describe('interviewService.updateStatus', () => {
  it('transitions a SCHEDULED interview to a terminal outcome', async () => {
    interviewRepoMock.findById.mockResolvedValueOnce(interviewRow());
    interviewRepoMock.updateStatus.mockResolvedValueOnce(interviewRow({ status: 'COMPLETED' }));
    const dto = await interviewService.updateStatus(TENANT, 'app-1', 'int-1', { status: 'COMPLETED' });
    expect(interviewRepoMock.updateStatus).toHaveBeenCalledWith('int-1', 'COMPLETED');
    expect(dto.status).toBe('COMPLETED');
  });

  it('blocks re-transition of an already-terminal interview with 409', async () => {
    interviewRepoMock.findById.mockResolvedValueOnce(interviewRow({ status: 'COMPLETED' }));
    await expect(
      interviewService.updateStatus(TENANT, 'app-1', 'int-1', { status: 'NO_SHOW' })
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_SCHEDULED' });
    expect(interviewRepoMock.updateStatus).not.toHaveBeenCalled();
  });

  it('throws NotFound when the interview belongs to another application', async () => {
    interviewRepoMock.findById.mockResolvedValueOnce(interviewRow({ applicationId: 'other' }));
    await expect(
      interviewService.updateStatus(TENANT, 'app-1', 'int-1', { status: 'COMPLETED' })
    ).rejects.toThrow('Interview not found');
  });
});

function enrichedRow(over: Record<string, unknown> = {}) {
  return interviewRow({
    application: {
      candidate: { id: 'cand-1', fullName: 'Ứng Viên', avatar: null, currentTitle: 'Dev' },
      job: { id: 'job-1', title: 'Backend' },
    },
    ...over,
  });
}

describe('interviewService.listMine', () => {
  it('returns empty groups when the user has no employee profile', async () => {
    employeeRepoMock.findByUserId.mockResolvedValueOnce(null);
    const res = await interviewService.listMine(TENANT, USER);
    expect(res).toEqual({ upcoming: [], toReview: [] });
    expect(interviewRepoMock.listUpcomingByInterviewer).not.toHaveBeenCalled();
    expect(interviewRepoMock.listToReviewByInterviewer).not.toHaveBeenCalled();
  });

  it('maps upcoming interviews with candidate + job (myScorecardSubmitted=false)', async () => {
    interviewRepoMock.listUpcomingByInterviewer.mockResolvedValueOnce([enrichedRow()]);
    interviewRepoMock.listToReviewByInterviewer.mockResolvedValueOnce([]);
    const res = await interviewService.listMine(TENANT, USER);
    expect(res.upcoming).toHaveLength(1);
    expect(res.upcoming[0].candidate.fullName).toBe('Ứng Viên');
    expect(res.upcoming[0].job.title).toBe('Backend');
    expect(res.upcoming[0].myScorecardSubmitted).toBe(false);
    expect(res.toReview).toEqual([]);
  });

  it('flags myScorecardSubmitted from my own scorecard presence', async () => {
    interviewRepoMock.listUpcomingByInterviewer.mockResolvedValueOnce([]);
    interviewRepoMock.listToReviewByInterviewer.mockResolvedValueOnce([
      enrichedRow({ id: 'done', scorecards: [{ id: 'sc-1' }] }),
      enrichedRow({ id: 'todo', scorecards: [] }),
    ]);
    const res = await interviewService.listMine(TENANT, USER);
    expect(res.toReview.find((r) => r.id === 'todo')!.myScorecardSubmitted).toBe(false);
    expect(res.toReview.find((r) => r.id === 'done')!.myScorecardSubmitted).toBe(true);
  });

  it('orders not-yet-scored interviews before scored ones in toReview', async () => {
    interviewRepoMock.listUpcomingByInterviewer.mockResolvedValueOnce([]);
    interviewRepoMock.listToReviewByInterviewer.mockResolvedValueOnce([
      enrichedRow({ id: 'done', scorecards: [{ id: 'sc-1' }] }),
      enrichedRow({ id: 'todo', scorecards: [] }),
    ]);
    const res = await interviewService.listMine(TENANT, USER);
    expect(res.toReview.map((r) => r.id)).toEqual(['todo', 'done']);
  });
});
