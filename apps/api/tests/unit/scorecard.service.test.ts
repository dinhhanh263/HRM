import { describe, it, expect, vi, beforeEach } from 'vitest';

const scorecardRepoMock = {
  findByInterview: vi.fn(),
  listByApplication: vi.fn(),
  upsertOwn: vi.fn(),
};
const interviewRepoMock = { findById: vi.fn(), listByApplication: vi.fn() };
const applicationRepoMock = { findById: vi.fn() };
const employeeRepoMock = { findByUserId: vi.fn() };

vi.mock('../../src/domain/repositories/scorecard.repository.js', () => ({
  scorecardRepository: scorecardRepoMock,
}));
vi.mock('../../src/domain/repositories/interview.repository.js', () => ({
  interviewRepository: interviewRepoMock,
}));
vi.mock('../../src/domain/repositories/application.repository.js', () => ({
  applicationRepository: applicationRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { scorecardService } = await import('../../src/domain/services/scorecard.service.js');

const TENANT = 'tenant-1';

function interview(over: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    tenantId: TENANT,
    applicationId: 'app-1',
    scheduledAt: new Date('2026-06-10T09:00:00Z'),
    mode: 'ONSITE',
    status: 'COMPLETED',
    interviewers: [
      { employee: { id: 'emp-1', fullName: 'PV Một', avatar: null } },
      { employee: { id: 'emp-2', fullName: 'PV Hai', avatar: null } },
    ],
    ...over,
  };
}

function card(over: Record<string, unknown> = {}) {
  return {
    id: 'sc-1',
    interviewId: 'int-1',
    interviewerId: 'emp-1',
    overall: 'YES',
    ratings: { TECHNICAL: 3 },
    notes: 'Ổn',
    submittedAt: new Date('2026-06-10T11:00:00Z'),
    interviewer: { id: 'emp-1', fullName: 'PV Một', avatar: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-1' });
  interviewRepoMock.findById.mockResolvedValue(interview());
});

describe('scorecardService.submit', () => {
  it('lets an assigned interviewer submit their own scorecard', async () => {
    scorecardRepoMock.upsertOwn.mockResolvedValueOnce(card());
    const dto = await scorecardService.submit(TENANT, 'user-1', 'int-1', {
      overall: 'YES',
      ratings: { TECHNICAL: 3 },
      notes: 'Ổn',
    });
    expect(scorecardRepoMock.upsertOwn).toHaveBeenCalledWith({
      interviewId: 'int-1',
      interviewerId: 'emp-1',
      overall: 'YES',
      ratings: { TECHNICAL: 3 },
      notes: 'Ổn',
    });
    expect(dto.isMine).toBe(true);
    expect(dto.overall).toBe('YES');
  });

  it('forbids a non-interviewer from submitting a scorecard', async () => {
    employeeRepoMock.findByUserId.mockResolvedValueOnce({ id: 'emp-9' });
    await expect(
      scorecardService.submit(TENANT, 'user-9', 'int-1', { overall: 'NO' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(scorecardRepoMock.upsertOwn).not.toHaveBeenCalled();
  });

  it('throws NotFound when the interview does not exist', async () => {
    interviewRepoMock.findById.mockResolvedValueOnce(null);
    await expect(
      scorecardService.submit(TENANT, 'user-1', 'missing', { overall: 'YES' })
    ).rejects.toThrow('Interview not found');
  });
});

describe('scorecardService.listForInterview — no-peek', () => {
  it('hides peers from an interviewer who has not submitted yet', async () => {
    // emp-1 is an interviewer but only emp-2 has submitted.
    scorecardRepoMock.findByInterview.mockResolvedValueOnce([
      card({ id: 'sc-2', interviewerId: 'emp-2', interviewer: { id: 'emp-2', fullName: 'PV Hai', avatar: null } }),
    ]);
    const dto = await scorecardService.listForInterview(TENANT, 'user-1', 'int-1');
    expect(dto.isInterviewer).toBe(true);
    expect(dto.mine).toBeNull();
    expect(dto.canViewOthers).toBe(false);
    expect(dto.others).toHaveLength(0);
    expect(dto.submittedCount).toBe(1);
    expect(dto.totalInterviewers).toBe(2);
  });

  it('reveals peers once the interviewer has submitted their own', async () => {
    scorecardRepoMock.findByInterview.mockResolvedValueOnce([
      card(), // emp-1 (mine)
      card({ id: 'sc-2', interviewerId: 'emp-2', overall: 'STRONG_YES', interviewer: { id: 'emp-2', fullName: 'PV Hai', avatar: null } }),
    ]);
    const dto = await scorecardService.listForInterview(TENANT, 'user-1', 'int-1');
    expect(dto.mine?.isMine).toBe(true);
    expect(dto.canViewOthers).toBe(true);
    expect(dto.others).toHaveLength(1);
    expect(dto.others[0].interviewer.employeeId).toBe('emp-2');
  });

  it('lets a non-interviewer (e.g. HR with application_view) read all submitted scorecards', async () => {
    employeeRepoMock.findByUserId.mockResolvedValueOnce({ id: 'emp-hr' });
    scorecardRepoMock.findByInterview.mockResolvedValueOnce([card(), card({ id: 'sc-2', interviewerId: 'emp-2', interviewer: { id: 'emp-2', fullName: 'PV Hai', avatar: null } })]);
    const dto = await scorecardService.listForInterview(TENANT, 'user-hr', 'int-1');
    expect(dto.isInterviewer).toBe(false);
    expect(dto.mine).toBeNull();
    expect(dto.canViewOthers).toBe(true);
    expect(dto.others).toHaveLength(2);
  });
});

describe('scorecardService.summaryByApplication — aggregate', () => {
  it('averages overall recommendations onto the 1..4 scale per interview', async () => {
    applicationRepoMock.findById.mockResolvedValueOnce({ id: 'app-1', tenantId: TENANT });
    interviewRepoMock.listByApplication.mockResolvedValueOnce([interview()]);
    scorecardRepoMock.listByApplication.mockResolvedValueOnce([
      card({ overall: 'YES' }), // 3
      card({ id: 'sc-2', interviewerId: 'emp-2', overall: 'STRONG_YES', interviewer: { id: 'emp-2', fullName: 'PV Hai', avatar: null } }), // 4
    ]);
    const rows = await scorecardService.summaryByApplication(TENANT, 'app-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].submittedCount).toBe(2);
    expect(rows[0].totalInterviewers).toBe(2);
    expect(rows[0].averageScore).toBe(3.5);
    expect(rows[0].recommendations).toHaveLength(2);
  });

  it('reports null average for an interview with no scorecards', async () => {
    applicationRepoMock.findById.mockResolvedValueOnce({ id: 'app-1', tenantId: TENANT });
    interviewRepoMock.listByApplication.mockResolvedValueOnce([interview()]);
    scorecardRepoMock.listByApplication.mockResolvedValueOnce([]);
    const rows = await scorecardService.summaryByApplication(TENANT, 'app-1');
    expect(rows[0].averageScore).toBeNull();
    expect(rows[0].submittedCount).toBe(0);
  });
});
