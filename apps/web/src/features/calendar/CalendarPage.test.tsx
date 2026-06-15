import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { CalendarMonthData } from '@hrm/shared';
import { CalendarPage } from './pages/CalendarPage';

// SPEC-035 — month grid of HR events: events land in their day cell, month
// navigation refetches, event chips deep-link with the same permission gating
// as the dashboard widget (SPEC-034).

let mockPermissions: string[] = [];
const mockNavigate = vi.fn();
const useCalendarEventsMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = {
      user: { id: 'u', fullName: 'Manager', email: 'm@e.com', permissions: mockPermissions },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('./hooks/useCalendarEvents', () => ({
  useCalendarEvents: (month: string) => useCalendarEventsMock(month),
}));

let mockWeekStart: 'mon' | 'sun' = 'mon';
vi.mock('@/features/settings/hooks/useSettings', () => ({
  usePublicSettings: () => ({
    data: { regional: { defaultLanguage: 'vi', weekStart: mockWeekStart } },
  }),
}));

// Tháng đang xem khởi tạo theo tháng hiện tại — fixture sinh động theo hôm nay
// để test không phụ thuộc ngày chạy.
const now = new Date();
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const day = (d: number) => `${MONTH}-${String(d).padStart(2, '0')}`;

function monthShift(offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const data: CalendarMonthData = {
  month: MONTH,
  events: [
    {
      kind: 'probation_ending',
      employeeId: 'emp-prob',
      employeeName: 'Probie Nguyen',
      department: 'Engineering',
      date: day(16),
    },
    {
      kind: 'birthday',
      employeeId: 'emp-bday',
      employeeName: 'Birthday Person',
      department: 'Engineering',
      date: day(20),
    },
  ],
  holidays: [
    {
      id: 'h-1',
      tenantId: 't-1',
      date: day(2),
      name: 'Ngày lễ Test',
      recurring: false,
      createdAt: '',
      updatedAt: '',
    },
  ],
};

describe('CalendarPage (SPEC-035)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['probation:view', 'employees:view'];
    mockWeekStart = 'mon';
    useCalendarEventsMock.mockReturnValue({ data, isLoading: false, isError: false });
  });

  // SPEC-036 — tenant regional default: tuần có thể bắt đầu Chủ nhật.
  it('starts the week on Sunday when the tenant says so', () => {
    mockWeekStart = 'sun';
    render(<CalendarPage />);

    const headers = screen.getAllByTestId('calendar-weekday');
    expect(headers[0]).toHaveTextContent('CN');
    // Sự kiện vẫn nằm đúng ô ngày của nó.
    const cell16 = screen.getByTestId(`calendar-day-${day(16)}`);
    expect(within(cell16).getByText(/Probie Nguyen/)).toBeInTheDocument();
  });

  it('starts the week on Monday by default', () => {
    render(<CalendarPage />);
    const headers = screen.getAllByTestId('calendar-weekday');
    expect(headers[0]).toHaveTextContent('Thứ 2');
  });

  it('places each event in its day cell', () => {
    render(<CalendarPage />);

    const cell16 = screen.getByTestId(`calendar-day-${day(16)}`);
    expect(within(cell16).getByText(/Probie Nguyen/)).toBeInTheDocument();
    const cell20 = screen.getByTestId(`calendar-day-${day(20)}`);
    expect(within(cell20).getByText(/Birthday Person/)).toBeInTheDocument();
  });

  it('shows the holiday name in its day cell', () => {
    render(<CalendarPage />);

    const cell2 = screen.getByTestId(`calendar-day-${day(2)}`);
    expect(within(cell2).getByText('Ngày lễ Test')).toBeInTheDocument();
  });

  it('navigates months with the prev/next/today controls', async () => {
    render(<CalendarPage />);
    expect(useCalendarEventsMock).toHaveBeenLastCalledWith(MONTH);

    await userEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    expect(useCalendarEventsMock).toHaveBeenLastCalledWith(monthShift(1));

    await userEvent.click(screen.getByRole('button', { name: 'Tháng trước' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tháng trước' }));
    expect(useCalendarEventsMock).toHaveBeenLastCalledWith(monthShift(-1));

    await userEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(useCalendarEventsMock).toHaveBeenLastCalledWith(MONTH);
  });

  it('deep-links a probation chip to the review screen', async () => {
    render(<CalendarPage />);

    await userEvent.click(screen.getByRole('button', { name: /Probie Nguyen/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/probation?employee=emp-prob');
  });

  it('renders chips non-interactive without the matching permission', () => {
    mockPermissions = [];
    render(<CalendarPage />);

    expect(screen.getByText(/Probie Nguyen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Probie Nguyen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Birthday Person/ })).not.toBeInTheDocument();
  });
});
