import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import type { TimesheetSummaryDto } from '@hrm/shared';
import i18n from '@/i18n';
import { TimesheetPage } from './TimesheetPage';

// Mutable auth state so each test can pick the role under test.
const authState: { user: { permissions: string[] } } = { user: { permissions: [] } };
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

// Stub the data hooks — this page test is about role-adaptive layout, not fetching.
const summary: TimesheetSummaryDto = {
  employeeId: 'emp-1',
  month: '2026-06',
  workingDaysInPeriod: 22,
  daysPresent: 18,
  daysAbsent: 1,
  paidLeaveDays: 2,
  unpaidLeaveDays: 1,
  holidayCount: 0,
  totalWorkedHours: 144,
  overtime: [{ category: 'OT_WEEKDAY', night: false, hours: 6, multiplier: 1.5 }],
};
vi.mock('../hooks/useAttendance', () => ({
  useMyAttendance: () => ({ data: [], isLoading: false }),
  useTimesheetSummary: () => ({ data: summary, isLoading: false }),
}));
// Preserve timesheetKeys (re-used by other hooks) while stubbing the policy hook.
vi.mock('../hooks/useTimesheetPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useTimesheetPolicy')>()),
  useTimesheetPolicy: () => ({ data: undefined }),
}));
vi.mock('../hooks/useHolidays', () => ({ useHolidays: () => ({ data: [] }) }));

// Keep the team surfaces light — they have their own hook tests elsewhere.
vi.mock('../components/TeamAttendance', () => ({
  TeamAttendance: () => <div data-testid="team-attendance" />,
}));
vi.mock('../components/TeamOvertime', () => ({
  TeamOvertime: () => <div data-testid="team-overtime" />,
}));
vi.mock('../components/CheckInCard', () => ({
  CheckInCard: () => <div data-testid="check-in-card" />,
}));
vi.mock('../components/MyOvertimePanel', () => ({
  MyOvertimePanel: () => <div data-testid="my-overtime" />,
}));

describe('TimesheetPage role-adaptive layout', () => {
  beforeEach(() => {
    authState.user.permissions = [];
    i18n.changeLanguage('en');
  });

  it('opens an EMPLOYEE on their own view with the payroll-grade summary', () => {
    authState.user.permissions = ['timesheet:view', 'timesheet:create'];
    render(<TimesheetPage />);

    // Self-service surfaces present, team surfaces absent.
    expect(screen.getByTestId('check-in-card')).toBeInTheDocument();
    expect(screen.queryByTestId('team-attendance')).not.toBeInTheDocument();

    // SummaryCard shows the partition + worked hours from the summary contract.
    // Scope the working-days value to its stat tile — the calendar also renders a day "22".
    const workingDays = screen.getByText('Working days').parentElement!;
    expect(within(workingDays).getByText('22')).toBeInTheDocument();
    expect(screen.getByText('144h')).toBeInTheDocument(); // total worked hours
    expect(screen.getByText('×1.5')).toBeInTheDocument(); // OT snapshot multiplier
  });

  it('opens a reviewer (MANAGER/HR) straight onto the team view', () => {
    authState.user.permissions = ['timesheet:view', 'timesheet:update', 'timesheet:approve'];
    render(<TimesheetPage />);

    expect(screen.getByTestId('team-attendance')).toBeInTheDocument();
    expect(screen.getByTestId('team-overtime')).toBeInTheDocument();
    // Self check-in card belongs to the "mine" tab, not the default team view.
    expect(screen.queryByTestId('check-in-card')).not.toBeInTheDocument();
  });
});
