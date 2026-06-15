import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { DashboardData } from '@hrm/shared';
import { DashboardPage } from './DashboardPage';

// SPEC-034 §3 — upcoming events deep-link to the action screen for the subject
// employee: probation_ending → the probation review screen, everything else →
// the employee profile. Permission gating is UX only (server re-checks).
let mockPermissions: string[] = [];
const mockNavigate = vi.fn();

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

const data: DashboardData = {
  role: 'MANAGER',
  stats: {
    totalActive: 3,
    onLeaveToday: 0,
    pendingApprovals: 0,
    newHiresThisMonth: 0,
    terminatedThisMonth: 0,
    departmentCount: 1,
  },
  pendingLeave: [],
  upcomingEvents: [
    {
      kind: 'probation_ending',
      employeeId: 'emp-prob',
      employeeName: 'Probie',
      department: 'Engineering',
      date: '2026-06-15',
    },
    {
      kind: 'birthday',
      employeeId: 'emp-bday',
      employeeName: 'Birthday Person',
      department: 'Engineering',
      date: '2026-06-20',
    },
  ],
};

vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => ({ data, isLoading: false, isError: false }),
}));

const PROBATION_EVENT = 'Sắp hết thử việc - Probie';
const BIRTHDAY_EVENT = 'Sinh nhật Birthday Person';

describe('DashboardPage — clickable upcoming events (SPEC-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
  });

  it('navigates to the probation screen with the employee preselected on probation event click', async () => {
    mockPermissions = ['probation:view'];
    render(<DashboardPage />);

    const item = screen.getByRole('button', { name: new RegExp(PROBATION_EVENT) });
    await userEvent.click(item);

    expect(mockNavigate).toHaveBeenCalledWith('/probation?employee=emp-prob');
  });

  it('navigates to the employee profile on a recurring event click', async () => {
    mockPermissions = ['employees:view'];
    render(<DashboardPage />);

    const item = screen.getByRole('button', { name: new RegExp(BIRTHDAY_EVENT) });
    await userEvent.click(item);

    expect(mockNavigate).toHaveBeenCalledWith('/employees/emp-bday');
  });

  it('renders events as plain (non-interactive) items without the matching permission', () => {
    mockPermissions = [];
    render(<DashboardPage />);

    // The text is visible but there is no actionable button around it.
    expect(screen.getByText(PROBATION_EVENT)).toBeInTheDocument();
    expect(screen.getByText(BIRTHDAY_EVENT)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: new RegExp(PROBATION_EVENT) })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: new RegExp(BIRTHDAY_EVENT) })
    ).not.toBeInTheDocument();
  });

  it('gates each event kind by its own permission', () => {
    // probation:view alone — the birthday item must stay non-interactive.
    mockPermissions = ['probation:view'];
    render(<DashboardPage />);

    expect(
      screen.getByRole('button', { name: new RegExp(PROBATION_EVENT) })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: new RegExp(BIRTHDAY_EVENT) })
    ).not.toBeInTheDocument();
  });
});
