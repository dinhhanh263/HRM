import { describe, it, expect, vi, beforeEach } from 'vitest';

const dashboardRepoMock = {
  countActiveEmployees: vi.fn(),
  countOnLeaveToday: vi.fn(),
  countPendingLeave: vi.fn(),
  countNewHires: vi.fn(),
  countTerminated: vi.fn(),
  countActiveDepartments: vi.fn(),
  departmentDistribution: vi.fn(),
  findPendingLeave: vi.fn(),
  findEventSourceEmployees: vi.fn(),
  findReportIds: vi.fn(),
};
const employeeRepoMock = {
  findByUserId: vi.fn(),
};
const leaveBalanceServiceMock = {
  getBalances: vi.fn(),
};
const permissionServiceMock = {
  getPermissionsForRole: vi.fn(),
};
const holidayServiceMock = {
  listByYear: vi.fn(),
};
const settingsServiceMock = {
  getNotificationSettings: vi.fn(),
};

vi.mock('../../src/domain/repositories/dashboard.repository.js', () => ({
  dashboardRepository: dashboardRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));
vi.mock('../../src/domain/services/leave-balance.service.js', () => ({
  leaveBalanceService: leaveBalanceServiceMock,
}));
vi.mock('../../src/domain/services/permission.service.js', () => ({
  permissionService: permissionServiceMock,
}));
vi.mock('../../src/domain/services/holiday.service.js', () => ({
  holidayService: holidayServiceMock,
}));
vi.mock('../../src/domain/services/settings.service.js', () => ({
  settingsService: settingsServiceMock,
}));

const { dashboardService, monthRange, dayRange, deriveUpcomingEvents, deriveMonthEvents } =
  await import('../../src/domain/services/dashboard.service.js');

function primeCounts() {
  settingsServiceMock.getNotificationSettings.mockResolvedValue({
    probationLeadDays: 7,
    contractLeadDays: 30,
  });
  dashboardRepoMock.countActiveEmployees.mockResolvedValue(40);
  dashboardRepoMock.countOnLeaveToday.mockResolvedValue(3);
  dashboardRepoMock.countPendingLeave.mockResolvedValue(5);
  dashboardRepoMock.countNewHires.mockResolvedValue(2);
  dashboardRepoMock.countTerminated.mockResolvedValue(1);
  dashboardRepoMock.countActiveDepartments.mockResolvedValue(6);
  dashboardRepoMock.departmentDistribution.mockResolvedValue([
    { departmentId: 'd-eng', name: 'Engineering', count: 20 },
    { departmentId: 'd-sales', name: 'Sales', count: 12 },
  ]);
  dashboardRepoMock.findEventSourceEmployees.mockResolvedValue([]);
  dashboardRepoMock.findPendingLeave.mockResolvedValue([
    {
      id: 'lr-1',
      employeeName: 'Emp One',
      leaveType: { name: 'Annual', colorHex: '#3B82F6' },
      startDate: '2026-06-05T00:00:00.000Z',
      endDate: '2026-06-06T00:00:00.000Z',
      totalDays: 2,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  ]);
}

describe('date window helpers', () => {
  it('monthRange returns first of this month and first of next month', () => {
    const { start, next } = monthRange(new Date(2026, 5, 15, 9, 30)); // June 2026
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(1);
  });

  it('monthRange rolls December over into next January', () => {
    const { start, next } = monthRange(new Date(2026, 11, 20)); // December 2026
    expect(start.getMonth()).toBe(11);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
  });

  it('dayRange spans the whole calendar day', () => {
    const { start, end } = dayRange(new Date(2026, 5, 15, 13, 45));
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(start.getDate()).toBe(15);
    expect(end.getDate()).toBe(15);
  });
});

describe('deriveUpcomingEvents', () => {
  // Reference "now": 2026-06-01, 30-day window → up to 2026-07-01.
  const now = new Date(2026, 5, 1, 9, 0, 0);

  function emp(
    over: Partial<{
      id: string;
      fullName: string;
      dateOfBirth: Date | null;
      joinDate: Date;
      departmentName: string | null;
      probationEndDate: Date | null;
      contractEndDate: Date | null;
    }>,
  ) {
    return {
      id: 'emp-1',
      fullName: 'Emp',
      dateOfBirth: null,
      joinDate: new Date(2020, 0, 1),
      departmentName: 'Engineering',
      probationEndDate: null,
      contractEndDate: null,
      ...over,
    };
  }

  it('emits a birthday whose next occurrence falls inside the window', () => {
    const events = deriveUpcomingEvents([emp({ fullName: 'Born June', dateOfBirth: new Date(1990, 5, 10) })], now);
    const birthdays = events.filter((e) => e.kind === 'birthday');
    expect(birthdays).toHaveLength(1);
    expect(birthdays[0]).toMatchObject({ employeeName: 'Born June', department: 'Engineering' });
    expect(birthdays[0].date.startsWith('2026-06-10')).toBe(true);
  });

  it('excludes birthdays outside the 30-day window', () => {
    const events = deriveUpcomingEvents([emp({ dateOfBirth: new Date(1990, 8, 1) })], now); // September
    expect(events.filter((e) => e.kind === 'birthday')).toHaveLength(0);
  });

  it('emits an anniversary with completed years when years >= 1', () => {
    const events = deriveUpcomingEvents([emp({ fullName: 'Five Yrs', joinDate: new Date(2021, 5, 15) })], now);
    const anniversaries = events.filter((e) => e.kind === 'anniversary');
    expect(anniversaries).toHaveLength(1);
    expect(anniversaries[0]).toMatchObject({ employeeName: 'Five Yrs', years: 5 });
    expect(anniversaries[0].date.startsWith('2026-06-15')).toBe(true);
  });

  it('does not emit an anniversary for someone who joined less than a year ago', () => {
    // Joined 2026-06-10 → next occurrence 2026-06-10 is 0 years → no anniversary, but is a new joiner.
    const events = deriveUpcomingEvents([emp({ joinDate: new Date(2026, 5, 10) })], now);
    expect(events.filter((e) => e.kind === 'anniversary')).toHaveLength(0);
  });

  it('emits a new_joiner when joinDate is within the forward window', () => {
    const events = deriveUpcomingEvents([emp({ fullName: 'Fresh', joinDate: new Date(2026, 5, 20) })], now);
    const joiners = events.filter((e) => e.kind === 'new_joiner');
    expect(joiners).toHaveLength(1);
    expect(joiners[0]).toMatchObject({ employeeName: 'Fresh' });
    expect(joiners[0].date.startsWith('2026-06-20')).toBe(true);
  });

  it('rolls a December birthday over into the window from late December', () => {
    const dec = new Date(2026, 11, 20, 9, 0, 0); // 2026-12-20, window → 2027-01-19
    const events = deriveUpcomingEvents([emp({ dateOfBirth: new Date(1990, 0, 5) })], dec); // Jan 5
    const birthdays = events.filter((e) => e.kind === 'birthday');
    expect(birthdays).toHaveLength(1);
    expect(birthdays[0].date.startsWith('2027-01-05')).toBe(true);
  });

  it('sorts events by date ascending', () => {
    const events = deriveUpcomingEvents(
      [
        emp({ fullName: 'B', dateOfBirth: new Date(1990, 5, 25) }),
        emp({ fullName: 'A', dateOfBirth: new Date(1990, 5, 5) }),
      ],
      now,
    );
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('stamps every event with the source employee id (SPEC-034 §1)', () => {
    const events = deriveUpcomingEvents(
      [
        emp({
          id: 'emp-link',
          fullName: 'Linked',
          dateOfBirth: new Date(1990, 5, 10),
          joinDate: new Date(2026, 5, 20),
          probationEndDate: new Date(2026, 5, 6),
          contractEndDate: new Date(2026, 5, 21),
        }),
      ],
      now,
      30,
      { probation: true, contract: true },
    );
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const e of events) expect(e.employeeId).toBe('emp-link');
  });

  describe('lifecycle kinds', () => {
    it('does NOT emit lifecycle events by default', () => {
      const events = deriveUpcomingEvents(
        [emp({ probationEndDate: new Date(2026, 5, 5), contractEndDate: new Date(2026, 5, 20) })],
        now,
      );
      expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
      expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
    });

    it('emits probation_ending within the 7-day window when probation is on', () => {
      const events = deriveUpcomingEvents(
        [emp({ fullName: 'Prob', probationEndDate: new Date(2026, 5, 6) })], // +5 days
        now,
        30,
        { probation: true, contract: true },
      );
      const probation = events.filter((e) => e.kind === 'probation_ending');
      expect(probation).toHaveLength(1);
      expect(probation[0]).toMatchObject({ employeeName: 'Prob', department: 'Engineering' });
      expect(probation[0].date.startsWith('2026-06-06')).toBe(true);
    });

    it('excludes probation past the 7-day lead (today+8)', () => {
      const events = deriveUpcomingEvents(
        [emp({ probationEndDate: new Date(2026, 5, 9) })], // +8 days
        now,
        30,
        { probation: true, contract: true },
      );
      expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
    });

    it('emits contract_expiring within the 30-day window but excludes today+31', () => {
      const inWindow = deriveUpcomingEvents(
        [emp({ fullName: 'Soon', contractEndDate: new Date(2026, 5, 21) })], // +20 days
        now,
        30,
        { probation: true, contract: true },
      );
      expect(inWindow.filter((e) => e.kind === 'contract_expiring')).toHaveLength(1);

      const past = deriveUpcomingEvents(
        [emp({ contractEndDate: new Date(2026, 6, 2) })], // 2026-07-02 = +31 days
        now,
        30,
        { probation: true, contract: true },
      );
      expect(past.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
    });

    it('excludes indefinite contracts (contractEndDate null)', () => {
      const events = deriveUpcomingEvents(
        [emp({ contractEndDate: null })],
        now,
        30,
        { probation: true, contract: true },
      );
      expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
    });

    it('windows lifecycle dates in ICT (matching the scan), not the server TZ', () => {
      // Date-only fields are persisted as UTC midnight (`new Date("2026-06-09")`).
      // At nowUtc the ICT calendar day is 2026-06-02, so 2026-06-09 is exactly 7
      // ICT-days out → inside the probation lead, exactly as the reminder scan
      // computes it. Server-local math (7d7h > 7d on a +7 host) would wrongly drop
      // it, letting the dashboard and the notification disagree.
      const nowUtc = new Date('2026-06-01T20:00:00Z'); // 2026-06-02 03:00 ICT
      const events = deriveUpcomingEvents(
        [emp({ fullName: 'Edge', probationEndDate: new Date('2026-06-09T00:00:00Z') })],
        nowUtc,
        30,
        { probation: true, contract: true },
      );
      const probation = events.filter((e) => e.kind === 'probation_ending');
      expect(probation).toHaveLength(1);
      expect(probation[0].date).toBe('2026-06-09');
    });

    // SPEC-036 — tenant-configured leads override the 7/30 defaults.
    it('honours a widened probation lead from settings', () => {
      const events = deriveUpcomingEvents(
        [emp({ probationEndDate: new Date(2026, 5, 11) })], // +10 ngày, ngoài lead mặc định 7
        now,
        30,
        { probation: true, probationLeadDays: 14 },
      );
      expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(1);
    });

    it('honours a widened contract lead from settings', () => {
      const events = deriveUpcomingEvents(
        [emp({ contractEndDate: new Date(2026, 6, 11) })], // +40 ngày, ngoài lead mặc định 30
        now,
        30,
        { contract: true, contractLeadDays: 60 },
      );
      expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(1);
    });

    // SPEC-034 §2 — team scope: probation only, never contract, never the manager's own.
    it('emits probation but not contract when contract is off (team scope)', () => {
      const events = deriveUpcomingEvents(
        [emp({ probationEndDate: new Date(2026, 5, 6), contractEndDate: new Date(2026, 5, 21) })],
        now,
        30,
        { probation: true },
      );
      expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(1);
      expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
    });

    it('skips the excluded employee for probation but keeps their recurring events', () => {
      const events = deriveUpcomingEvents(
        [
          emp({
            id: 'emp-mgr',
            fullName: 'Manager Self',
            dateOfBirth: new Date(1985, 5, 12),
            probationEndDate: new Date(2026, 5, 6),
          }),
          emp({ id: 'emp-report', fullName: 'Report', probationEndDate: new Date(2026, 5, 6) }),
        ],
        now,
        30,
        { probation: true, probationExcludeEmployeeId: 'emp-mgr' },
      );
      const probation = events.filter((e) => e.kind === 'probation_ending');
      expect(probation).toHaveLength(1);
      expect(probation[0].employeeId).toBe('emp-report');
      // The manager's own birthday is still a team event.
      expect(events.filter((e) => e.kind === 'birthday' && e.employeeId === 'emp-mgr')).toHaveLength(1);
    });
  });
});

describe('dashboardService.getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeCounts();
    leaveBalanceServiceMock.getBalances.mockResolvedValue([]);
  });

  it('uses company scope (no employee filter) for HR_MANAGER and echoes the role', async () => {
    const data = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(data.role).toBe('HR_MANAGER');
    expect(data.stats).toEqual({
      totalActive: 40,
      onLeaveToday: 3,
      pendingApprovals: 5,
      newHiresThisMonth: 2,
      terminatedThisMonth: 1,
      departmentCount: 6,
    });
    expect(data.upcomingEvents).toEqual([]);
    // company scope → repo called with undefined employee filter
    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', undefined);
    expect(employeeRepoMock.findByUserId).not.toHaveBeenCalled();
  });

  it('includes department distribution for company scope (HR/Admin only)', async () => {
    const data = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.departmentDistribution).toHaveBeenCalledWith('t-1', undefined);
    expect(data.departmentDistribution).toEqual([
      { departmentId: 'd-eng', name: 'Engineering', count: 20 },
      { departmentId: 'd-sales', name: 'Sales', count: 12 },
    ]);
  });

  it('surfaces scoped pending leave requests', async () => {
    const data = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.findPendingLeave).toHaveBeenCalledWith('t-1', undefined);
    expect(data.pendingLeave).toHaveLength(1);
    expect(data.pendingLeave[0]).toMatchObject({ id: 'lr-1', employeeName: 'Emp One' });
  });

  it('omits department distribution for non-company scope', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-self', tenantId: 't-1' });

    const data = await dashboardService.getDashboard(
      { sub: 'u-emp', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.departmentDistribution).not.toHaveBeenCalled();
    expect(data.departmentDistribution).toBeUndefined();
  });

  it('treats SUPER_ADMIN as company scope', async () => {
    await dashboardService.getDashboard(
      { sub: 'u-sa', tenantId: 't-1', role: 'SUPER_ADMIN' },
      new Date(2026, 5, 1),
    );
    expect(dashboardRepoMock.countPendingLeave).toHaveBeenCalledWith('t-1', undefined);
    expect(employeeRepoMock.findByUserId).not.toHaveBeenCalled();
  });

  it('scopes MANAGER to self + direct reports', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-mgr', tenantId: 't-1' });
    dashboardRepoMock.findReportIds.mockResolvedValue(['emp-a', 'emp-b']);

    await dashboardService.getDashboard(
      { sub: 'u-mgr', tenantId: 't-1', role: 'MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.findReportIds).toHaveBeenCalledWith('emp-mgr', 't-1');
    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', [
      'emp-mgr',
      'emp-a',
      'emp-b',
    ]);
  });

  it('scopes EMPLOYEE to self only', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-self', tenantId: 't-1' });

    await dashboardService.getDashboard(
      { sub: 'u-emp', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', ['emp-self']);
    expect(dashboardRepoMock.findReportIds).not.toHaveBeenCalled();
  });

  it('returns empty scope (no rows) for a profile-less non-company user', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue(null);

    await dashboardService.getDashboard(
      { sub: 'u-ghost', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );

    // empty employee-id list → matches no employee → graceful empties
    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', []);
  });

  it('populates myLeaveBalance and myPendingRequests for EMPLOYEE self scope', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-self', tenantId: 't-1' });
    dashboardRepoMock.countPendingLeave.mockResolvedValue(2);
    leaveBalanceServiceMock.getBalances.mockResolvedValue([
      {
        leaveTypeId: 'lt-1',
        leaveTypeName: 'Annual',
        leaveTypeCode: 'ANNUAL',
        colorHex: '#3B82F6',
        paid: true,
        year: 2026,
        allocated: 12,
        used: 3,
        pending: 1,
        remaining: 8,
      },
    ]);

    const data = await dashboardService.getDashboard(
      { sub: 'u-emp', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );

    expect(leaveBalanceServiceMock.getBalances).toHaveBeenCalledWith('t-1', 'emp-self', 2026);
    expect(data.myLeaveBalance).toEqual([
      { leaveType: { name: 'Annual', colorHex: '#3B82F6' }, allocated: 12, used: 3, remaining: 8 },
    ]);
    expect(data.stats.myPendingRequests).toBe(2);
  });

  it('omits self-service blocks for company scope', async () => {
    const data = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(leaveBalanceServiceMock.getBalances).not.toHaveBeenCalled();
    expect(data.myLeaveBalance).toBeUndefined();
    expect(data.stats.myPendingRequests).toBeUndefined();
  });

  it('does not fetch balances for a profile-less employee', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue(null);

    const data = await dashboardService.getDashboard(
      { sub: 'u-ghost', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );

    expect(leaveBalanceServiceMock.getBalances).not.toHaveBeenCalled();
    expect(data.myLeaveBalance).toBeUndefined();
  });

  it('emits lifecycle events for company scope (HR) but not for self scope (EMPLOYEE)', async () => {
    const lifecycleSource = [
      {
        id: 'emp-prob',
        fullName: 'Prob Ending',
        dateOfBirth: null,
        joinDate: new Date(2020, 0, 1),
        departmentName: 'Engineering',
        probationEndDate: new Date(2026, 5, 5), // +4 days, within 7
        contractEndDate: null,
      },
    ];
    dashboardRepoMock.findEventSourceEmployees.mockResolvedValue(lifecycleSource);

    const hrData = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );
    expect(hrData.upcomingEvents.filter((e) => e.kind === 'probation_ending')).toHaveLength(1);

    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-self', tenantId: 't-1' });
    const empData = await dashboardService.getDashboard(
      { sub: 'u-emp', tenantId: 't-1', role: 'EMPLOYEE' },
      new Date(2026, 5, 1),
    );
    expect(empData.upcomingEvents.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
  });

  // SPEC-036 — getDashboard threads the tenant's configured leads into the
  // event derivation: a probation 10 days out appears once the lead is 14.
  it('applies tenant-configured notification leads to upcoming events', async () => {
    settingsServiceMock.getNotificationSettings.mockResolvedValue({
      probationLeadDays: 14,
      contractLeadDays: 30,
    });
    dashboardRepoMock.findEventSourceEmployees.mockResolvedValue([
      {
        id: 'emp-far',
        fullName: 'Far Probation',
        dateOfBirth: null,
        joinDate: new Date(2020, 0, 1),
        departmentName: 'Engineering',
        probationEndDate: new Date(2026, 5, 11), // +10 ngày so với now 2026-06-01
        contractEndDate: null,
      },
    ]);

    const data = await dashboardService.getDashboard(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      new Date(2026, 5, 1),
    );

    expect(settingsServiceMock.getNotificationSettings).toHaveBeenCalledWith('t-1');
    expect(data.upcomingEvents.filter((e) => e.kind === 'probation_ending')).toHaveLength(1);
  });

  // SPEC-034 §2 — a MANAGER sees probation_ending for direct reports (with the
  // employeeId needed to deep-link), never their own, and never contract_expiring
  // (contracts stay HR's job).
  it('emits team probation_ending (reports only, no contract) for MANAGER scope', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-mgr', tenantId: 't-1' });
    dashboardRepoMock.findReportIds.mockResolvedValue(['emp-report']);
    dashboardRepoMock.findEventSourceEmployees.mockResolvedValue([
      {
        id: 'emp-mgr',
        fullName: 'Manager Self',
        dateOfBirth: null,
        joinDate: new Date(2020, 0, 1),
        departmentName: 'Engineering',
        probationEndDate: new Date(2026, 5, 5), // manager somehow probationary — not their own event
        contractEndDate: null,
      },
      {
        id: 'emp-report',
        fullName: 'Report One',
        dateOfBirth: null,
        joinDate: new Date(2025, 0, 1),
        departmentName: 'Engineering',
        probationEndDate: new Date(2026, 5, 5), // +4 days, within 7
        contractEndDate: new Date(2026, 5, 20), // within 30 — still hidden from team scope
      },
    ]);

    const data = await dashboardService.getDashboard(
      { sub: 'u-mgr', tenantId: 't-1', role: 'MANAGER' },
      new Date(2026, 5, 1),
    );

    const probation = data.upcomingEvents.filter((e) => e.kind === 'probation_ending');
    expect(probation).toHaveLength(1);
    expect(probation[0]).toMatchObject({ employeeId: 'emp-report', employeeName: 'Report One' });
    expect(data.upcomingEvents.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
  });
});

// SPEC-014 Đ2 stores a custom role with a neutral EMPLOYEE legacy enum, so the
// enum under-reports the role's real reach. The dashboard must derive scope from
// the role's actual permissions (mirrors the HR/manager scope gates used by the
// timesheet/payroll/leave controllers), not the downgraded enum.
describe('dashboardService.getDashboard — custom-role scope (permission-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeCounts();
    leaveBalanceServiceMock.getBalances.mockResolvedValue([]);
    permissionServiceMock.getPermissionsForRole.mockResolvedValue(new Set<string>());
  });

  it('gives company scope to a custom role granted employees:update despite EMPLOYEE enum', async () => {
    permissionServiceMock.getPermissionsForRole.mockResolvedValue(
      new Set(['dashboard:view', 'employees:view', 'employees:update']),
    );

    await dashboardService.getDashboard(
      { sub: 'u-custom', tenantId: 't-1', role: 'EMPLOYEE', roleId: 'role-hr-like' },
      new Date(2026, 5, 1),
    );

    expect(permissionServiceMock.getPermissionsForRole).toHaveBeenCalledWith('role-hr-like');
    // company scope → no employee filter, no profile lookup
    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', undefined);
    expect(employeeRepoMock.findByUserId).not.toHaveBeenCalled();
  });

  it('gives team scope to a custom reviewer role (leave:approve) with EMPLOYEE enum', async () => {
    permissionServiceMock.getPermissionsForRole.mockResolvedValue(
      new Set(['dashboard:view', 'employees:view', 'leave:approve']),
    );
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-lead', tenantId: 't-1' });
    dashboardRepoMock.findReportIds.mockResolvedValue(['emp-x', 'emp-y']);

    await dashboardService.getDashboard(
      { sub: 'u-lead', tenantId: 't-1', role: 'EMPLOYEE', roleId: 'role-team-lead' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.findReportIds).toHaveBeenCalledWith('emp-lead', 't-1');
    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', [
      'emp-lead',
      'emp-x',
      'emp-y',
    ]);
  });

  it('gives team scope to a custom reviewer role granted timesheet:approve', async () => {
    permissionServiceMock.getPermissionsForRole.mockResolvedValue(
      new Set(['dashboard:view', 'timesheet:approve']),
    );
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-lead', tenantId: 't-1' });
    dashboardRepoMock.findReportIds.mockResolvedValue(['emp-x']);

    await dashboardService.getDashboard(
      { sub: 'u-lead', tenantId: 't-1', role: 'EMPLOYEE', roleId: 'role-ts-lead' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', ['emp-lead', 'emp-x']);
  });

  it('keeps self scope for a custom role with only self-service permissions', async () => {
    permissionServiceMock.getPermissionsForRole.mockResolvedValue(
      new Set(['dashboard:view', 'payroll:view', 'payroll:approve']),
    );
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-self', tenantId: 't-1' });

    await dashboardService.getDashboard(
      { sub: 'u-approver', tenantId: 't-1', role: 'EMPLOYEE', roleId: 'role-payroll-approver' },
      new Date(2026, 5, 1),
    );

    expect(dashboardRepoMock.countActiveEmployees).toHaveBeenCalledWith('t-1', ['emp-self']);
    expect(dashboardRepoMock.findReportIds).not.toHaveBeenCalled();
  });
});

// SPEC-035 — the calendar derives events that *fall inside* a month (no lead
// windows like the dashboard widget): the month grid must show a probation end
// on its actual date even when it is 3 weeks out.
describe('deriveMonthEvents', () => {
  function emp(
    over: Partial<{
      id: string;
      fullName: string;
      dateOfBirth: Date | null;
      joinDate: Date;
      departmentName: string | null;
      probationEndDate: Date | null;
      contractEndDate: Date | null;
    }>,
  ) {
    return {
      id: 'emp-1',
      fullName: 'Emp',
      dateOfBirth: null,
      joinDate: new Date(2020, 0, 1),
      departmentName: 'Engineering',
      probationEndDate: null,
      contractEndDate: null,
      ...over,
    };
  }

  it("emits a birthday on its occurrence inside the requested month, with the employee id", () => {
    const events = deriveMonthEvents(
      [emp({ id: 'e-b', fullName: 'Born June', dateOfBirth: new Date(1990, 5, 10) })],
      '2026-06',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'birthday',
      employeeId: 'e-b',
      employeeName: 'Born June',
      date: '2026-06-10',
    });
  });

  it('omits birthdays whose occurrence falls in another month', () => {
    const events = deriveMonthEvents([emp({ dateOfBirth: new Date(1990, 8, 1) })], '2026-06');
    expect(events.filter((e) => e.kind === 'birthday')).toHaveLength(0);
  });

  it('emits an anniversary with years counted against the grid year', () => {
    const events = deriveMonthEvents([emp({ joinDate: new Date(2021, 5, 15) })], '2026-06');
    const anniversaries = events.filter((e) => e.kind === 'anniversary');
    expect(anniversaries).toHaveLength(1);
    expect(anniversaries[0]).toMatchObject({ date: '2026-06-15', years: 5 });
  });

  it('treats a same-year joiner as new_joiner, never a 0-year anniversary', () => {
    const events = deriveMonthEvents([emp({ joinDate: new Date(2026, 5, 20) })], '2026-06');
    expect(events.filter((e) => e.kind === 'anniversary')).toHaveLength(0);
    const joiners = events.filter((e) => e.kind === 'new_joiner');
    expect(joiners).toHaveLength(1);
    expect(joiners[0].date).toBe('2026-06-20');
  });

  it('omits new_joiner when the join date is in a different month', () => {
    const events = deriveMonthEvents([emp({ joinDate: new Date(2026, 4, 30) })], '2026-06');
    expect(events.filter((e) => e.kind === 'new_joiner')).toHaveLength(0);
  });

  it('emits probation_ending anywhere in the month (no 7-day lead) when probation is on', () => {
    const events = deriveMonthEvents(
      [emp({ probationEndDate: new Date('2026-06-30T00:00:00Z') })], // 3 tuần ra ngoài lead
      '2026-06',
      { probation: true },
    );
    const probation = events.filter((e) => e.kind === 'probation_ending');
    expect(probation).toHaveLength(1);
    expect(probation[0].date).toBe('2026-06-30');
  });

  it('windows lifecycle dates on the ICT calendar month', () => {
    // 2026-07-01T00:00:00Z = 07:00 ngày 01/07 ICT → tháng 7, không phải tháng 6.
    const events = deriveMonthEvents(
      [emp({ probationEndDate: new Date('2026-07-01T00:00:00Z') })],
      '2026-06',
      { probation: true, contract: true },
    );
    expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
  });

  it('honours lifecycle options: contract off, and the excluded employee skipped', () => {
    const events = deriveMonthEvents(
      [
        emp({
          id: 'emp-mgr',
          fullName: 'Manager Self',
          probationEndDate: new Date('2026-06-20T00:00:00Z'),
          contractEndDate: new Date('2026-06-25T00:00:00Z'),
        }),
        emp({ id: 'emp-report', probationEndDate: new Date('2026-06-20T00:00:00Z') }),
      ],
      '2026-06',
      { probation: true, probationExcludeEmployeeId: 'emp-mgr' },
    );
    const probation = events.filter((e) => e.kind === 'probation_ending');
    expect(probation).toHaveLength(1);
    expect(probation[0].employeeId).toBe('emp-report');
    expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
  });

  it('emits contract_expiring inside the month when contract is on', () => {
    const events = deriveMonthEvents(
      [emp({ contractEndDate: new Date('2026-06-25T00:00:00Z') })],
      '2026-06',
      { probation: true, contract: true },
    );
    expect(events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(1);
  });

  it('returns no lifecycle events by default and sorts ascending by date', () => {
    const events = deriveMonthEvents(
      [
        emp({ id: 'e-1', fullName: 'B', dateOfBirth: new Date(1990, 5, 25) }),
        emp({ id: 'e-2', fullName: 'A', dateOfBirth: new Date(1990, 5, 5) }),
        emp({ id: 'e-3', probationEndDate: new Date('2026-06-10T00:00:00Z') }),
      ],
      '2026-06',
    );
    expect(events.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });
});

// SPEC-035 — endpoint payload: events per scope (company both lifecycle kinds,
// team probation-of-reports only, self none) + tenant holidays of the month.
describe('dashboardService.getCalendarEvents', () => {
  const juneSource = [
    {
      id: 'emp-mgr',
      fullName: 'Manager Self',
      dateOfBirth: null,
      joinDate: new Date(2020, 0, 1),
      departmentName: 'Engineering',
      probationEndDate: new Date('2026-06-20T00:00:00Z'),
      contractEndDate: null,
    },
    {
      id: 'emp-report',
      fullName: 'Report One',
      dateOfBirth: null,
      joinDate: new Date(2025, 0, 1),
      departmentName: 'Engineering',
      probationEndDate: new Date('2026-06-22T00:00:00Z'),
      contractEndDate: new Date('2026-06-28T00:00:00Z'),
    },
  ];
  const holidays = [
    { id: 'h-jun', tenantId: 't-1', date: '2026-06-01', name: 'Test June', recurring: false },
    { id: 'h-sep', tenantId: 't-1', date: '2026-09-02', name: 'Quốc khánh', recurring: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardRepoMock.findEventSourceEmployees.mockResolvedValue(juneSource);
    holidayServiceMock.listByYear.mockResolvedValue(holidays);
  });

  it('returns both lifecycle kinds and month-filtered holidays for company scope', async () => {
    const data = await dashboardService.getCalendarEvents(
      { sub: 'u-hr', tenantId: 't-1', role: 'HR_MANAGER' },
      '2026-06',
    );

    expect(data.month).toBe('2026-06');
    expect(holidayServiceMock.listByYear).toHaveBeenCalledWith('t-1', 2026);
    expect(data.holidays).toEqual([holidays[0]]); // ngày lễ tháng 9 bị lọc
    const kinds = data.events.map((e) => e.kind);
    expect(kinds).toContain('probation_ending');
    expect(kinds).toContain('contract_expiring');
  });

  it("gives a MANAGER the reports' probation only — not their own, no contracts", async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-mgr', tenantId: 't-1' });
    dashboardRepoMock.findReportIds.mockResolvedValue(['emp-report']);

    const data = await dashboardService.getCalendarEvents(
      { sub: 'u-mgr', tenantId: 't-1', role: 'MANAGER' },
      '2026-06',
    );

    expect(dashboardRepoMock.findEventSourceEmployees).toHaveBeenCalledWith('t-1', [
      'emp-mgr',
      'emp-report',
    ]);
    const probation = data.events.filter((e) => e.kind === 'probation_ending');
    expect(probation).toHaveLength(1);
    expect(probation[0].employeeId).toBe('emp-report');
    expect(data.events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
  });

  it('gives an EMPLOYEE no lifecycle events but still the tenant holidays', async () => {
    employeeRepoMock.findByUserId.mockResolvedValue({ id: 'emp-report', tenantId: 't-1' });

    const data = await dashboardService.getCalendarEvents(
      { sub: 'u-emp', tenantId: 't-1', role: 'EMPLOYEE' },
      '2026-06',
    );

    expect(data.events.filter((e) => e.kind === 'probation_ending')).toHaveLength(0);
    expect(data.events.filter((e) => e.kind === 'contract_expiring')).toHaveLength(0);
    expect(data.holidays).toEqual([holidays[0]]);
  });
});
