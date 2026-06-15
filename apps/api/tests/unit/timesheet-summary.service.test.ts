import { describe, it, expect, vi, beforeEach } from 'vitest';

const attendanceRepoMock = {
  findByEmployeeAndRange: vi.fn(),
};
const overtimeRepoMock = {
  findApprovedInRange: vi.fn(),
};
const leaveRepoMock = {
  findApprovedInRange: vi.fn(),
};
const holidayRepoMock = {
  findByYear: vi.fn(),
};
const policyServiceMock = {
  getPolicy: vi.fn(),
};

vi.mock('../../src/domain/repositories/attendance.repository.js', () => ({
  attendanceRepository: attendanceRepoMock,
  attendanceWithEmployee: {},
}));
vi.mock('../../src/domain/repositories/overtime.repository.js', () => ({
  overtimeRepository: overtimeRepoMock,
  overtimeWithEmployee: {},
}));
vi.mock('../../src/domain/repositories/leave-request.repository.js', () => ({
  leaveRequestRepository: leaveRepoMock,
}));
vi.mock('../../src/domain/repositories/holiday.repository.js', () => ({
  holidayRepository: holidayRepoMock,
}));
vi.mock('../../src/domain/services/timesheet-policy.service.js', () => ({
  timesheetPolicyService: policyServiceMock,
}));

const { timesheetSummaryService } = await import(
  '../../src/domain/services/timesheet-summary.service.js'
);

function utc(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}

describe('timesheetSummaryService.getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue({ workdays: [1, 2, 3, 4, 5] });
    holidayRepoMock.findByYear.mockResolvedValue([]);
    attendanceRepoMock.findByEmployeeAndRange.mockResolvedValue([]);
    leaveRepoMock.findApprovedInRange.mockResolvedValue([]);
    overtimeRepoMock.findApprovedInRange.mockResolvedValue([]);
  });

  it('rejects a malformed month', async () => {
    await expect(
      timesheetSummaryService.getSummary('tenant-1', 'emp-1', '2026-6'),
    ).rejects.toThrow();
  });

  it('queries every source tenant- and employee-scoped over the month range', async () => {
    await timesheetSummaryService.getSummary('tenant-1', 'emp-1', '2026-06');

    const start = new Date(Date.UTC(2026, 5, 1));
    const end = new Date(Date.UTC(2026, 6, 1));
    expect(attendanceRepoMock.findByEmployeeAndRange).toHaveBeenCalledWith(
      'tenant-1',
      'emp-1',
      start,
      end,
    );
    expect(overtimeRepoMock.findApprovedInRange).toHaveBeenCalledWith('tenant-1', 'emp-1', start, end);
    expect(leaveRepoMock.findApprovedInRange).toHaveBeenCalledWith('tenant-1', 'emp-1', start, end);
    expect(holidayRepoMock.findByYear).toHaveBeenCalledWith('tenant-1', 2026);
  });

  it('aggregates attendance, leave (paid flag from leave type) and approved OT', async () => {
    attendanceRepoMock.findByEmployeeAndRange.mockResolvedValue([
      { workDate: utc(1), workedHours: 8 },
    ]);
    leaveRepoMock.findApprovedInRange.mockResolvedValue([
      { startDate: utc(2), endDate: utc(3), halfDay: false, leaveType: { paid: true } },
      { startDate: utc(4), endDate: utc(4), halfDay: false, leaveType: { paid: false } },
    ]);
    overtimeRepoMock.findApprovedInRange.mockResolvedValue([
      { category: 'OT_WEEKDAY', night: false, hours: 2, multiplier: 1.5 },
    ]);

    const s = await timesheetSummaryService.getSummary('tenant-1', 'emp-1', '2026-06');

    expect(s.employeeId).toBe('emp-1');
    expect(s.month).toBe('2026-06');
    expect(s.daysPresent).toBe(1);
    expect(s.paidLeaveDays).toBe(2);
    expect(s.unpaidLeaveDays).toBe(1);
    expect(s.totalWorkedHours).toBe(8);
    expect(s.overtime).toEqual([
      { category: 'OT_WEEKDAY', night: false, hours: 2, multiplier: 1.5 },
    ]);
    expect(s.daysPresent + s.paidLeaveDays + s.unpaidLeaveDays + s.daysAbsent).toBe(
      s.workingDaysInPeriod,
    );
  });
});
