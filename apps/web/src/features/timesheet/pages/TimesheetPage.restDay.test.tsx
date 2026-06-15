import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type {
  AttendanceRecordDto,
  HolidayDto,
  OvertimeRequestDto,
  PaginatedResponse,
  TimesheetSummaryDto,
} from '@hrm/shared';
import i18n from '@/i18n';
import { currentDateKey } from '../utils';
import { TimesheetPage } from './TimesheetPage';

const TODAY = currentDateKey();

// EMPLOYEE auth so the page renders the self-service "mine" view (where check-in lives).
const authState = { user: { permissions: ['timesheet:view', 'timesheet:create'] } };
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

// Mutable data the individual tests tweak before rendering. `workdays` drives
// rest-day classification deterministically regardless of the real calendar day:
//   all 7 days are workdays  → TODAY is a workday (unless a holiday matches)
//   no days are workdays     → TODAY is a weekend rest day
const data: {
  records: AttendanceRecordDto[];
  holidays: HolidayDto[];
  overtime: OvertimeRequestDto[];
  workdays: number[];
} = { records: [], holidays: [], overtime: [], workdays: [0, 1, 2, 3, 4, 5, 6] };

const summary: TimesheetSummaryDto = {
  employeeId: 'emp-1',
  month: TODAY.slice(0, 7),
  workingDaysInPeriod: 22,
  daysPresent: 1,
  daysAbsent: 0,
  paidLeaveDays: 0,
  unpaidLeaveDays: 0,
  holidayCount: 1,
  totalWorkedHours: 8,
  overtime: [],
};

vi.mock('../hooks/useAttendance', () => ({
  useMyAttendance: () => ({ data: data.records, isLoading: false }),
  useTimesheetSummary: () => ({ data: summary, isLoading: false }),
}));
vi.mock('../hooks/useTimesheetPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useTimesheetPolicy')>()),
  useTimesheetPolicy: () => ({ data: { workdays: data.workdays } }),
}));
vi.mock('../hooks/useHolidays', () => ({ useHolidays: () => ({ data: data.holidays }) }));
vi.mock('../hooks/useOvertime', () => ({
  useMyOvertime: () => ({
    data: { data: data.overtime, pagination: {} } as PaginatedResponse<OvertimeRequestDto>,
  }),
  // OvertimeSheet (rendered for real) only needs a no-op submitter.
  useSubmitOvertime: () => ({ mutate: vi.fn(), isPending: false }),
  useResubmitOvertime: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Keep heavy siblings light; the rest-day card + OvertimeSheet under test stay real.
// CheckInCard is mocked to a sentinel so we can assert it's swapped out on rest days.
vi.mock('../components/CheckInCard', () => ({
  CheckInCard: () => <div data-testid="check-in-card" />,
}));
vi.mock('../components/MyOvertimePanel', () => ({ MyOvertimePanel: () => <div data-testid="my-ot" /> }));
vi.mock('../components/AttendanceCalendar', () => ({ AttendanceCalendar: () => <div /> }));
vi.mock('../components/SummaryCard', () => ({ SummaryCard: () => <div /> }));

function nationalDay(): HolidayDto {
  return {
    id: 'h1',
    tenantId: 't1',
    date: TODAY,
    name: 'Quốc khánh',
    recurring: true,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
  };
}

function existingOt(): OvertimeRequestDto {
  return {
    id: 'ot-1',
    tenantId: 't1',
    employeeId: 'emp-1',
    workDate: TODAY,
    hours: 4,
    night: false,
    category: 'OT_HOLIDAY',
    reason: null,
    status: 'PENDING',
    flowId: null,
    currentStep: 0,
    multiplier: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: `${TODAY}T02:00:00.000Z`,
    updatedAt: `${TODAY}T02:00:00.000Z`,
  };
}

describe('TimesheetPage — rest-day guideline replaces check-in', () => {
  beforeEach(() => {
    data.records = [];
    data.holidays = [];
    data.overtime = [];
    data.workdays = [0, 1, 2, 3, 4, 5, 6]; // every day a workday by default
    i18n.changeLanguage('vi');
  });

  it('shows the check-in card on an ordinary working day', () => {
    render(<TimesheetPage />);
    expect(screen.getByTestId('check-in-card')).toBeInTheDocument();
    expect(screen.queryByText(/ngày nghỉ/i)).not.toBeInTheDocument();
  });

  it('replaces check-in with the holiday guideline on a public holiday', () => {
    data.holidays = [nationalDay()];
    render(<TimesheetPage />);
    expect(screen.queryByTestId('check-in-card')).not.toBeInTheDocument();
    expect(screen.getByText(/Quốc khánh/)).toBeInTheDocument();
    expect(screen.getByText(/≥300%/)).toBeInTheDocument();
  });

  it('replaces check-in with the weekend guideline on a weekly rest day', () => {
    data.workdays = []; // no workdays → today is a weekend rest day
    render(<TimesheetPage />);
    expect(screen.queryByTestId('check-in-card')).not.toBeInTheDocument();
    expect(screen.getByText(/Ngày nghỉ cuối tuần/)).toBeInTheDocument();
    expect(screen.getByText(/≥200%/)).toBeInTheDocument();
  });

  it('opens the overtime form pre-filled with today when the CTA is clicked', async () => {
    data.holidays = [nationalDay()];
    render(<TimesheetPage />);
    await userEvent.click(screen.getByRole('button', { name: /tạo đơn tăng ca/i }));
    expect(screen.getByLabelText(/ngày làm/i)).toHaveValue(TODAY);
  });

  it('confirms an existing overtime request instead of prompting again', () => {
    data.holidays = [nationalDay()];
    data.overtime = [existingOt()];
    render(<TimesheetPage />);
    expect(screen.getByText(/đã có đơn tăng ca/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tạo đơn tăng ca/i })).not.toBeInTheDocument();
  });
});
