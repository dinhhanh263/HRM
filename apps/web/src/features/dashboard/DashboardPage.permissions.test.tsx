import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { DashboardData } from '@hrm/shared';
import { DashboardPage } from './DashboardPage';

// Mutable across tests: each case sets the current user's permission list and an
// optional fullName, then asserts the RBAC-gated quick-action buttons (and the
// greeting fallback) adapt. Client gating is UX only — routes are re-checked
// server-side — but the buttons must not invite actions the user cannot perform.
let mockPermissions: string[] = [];
let mockFullName: string | undefined = 'Test User';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = {
      user: { id: 'u', fullName: mockFullName, email: 'u@e.com', permissions: mockPermissions },
    };
    return selector ? selector(state) : state;
  },
}));

const data: DashboardData = {
  role: 'HR_MANAGER',
  stats: {
    totalActive: 10,
    onLeaveToday: 1,
    pendingApprovals: 2,
    newHiresThisMonth: 1,
    terminatedThisMonth: 0,
    departmentCount: 3,
  },
  departmentDistribution: [{ departmentId: 'd', name: 'Engineering', count: 5 }],
  pendingLeave: [],
  upcomingEvents: [],
};

vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => ({ data, isLoading: false, isError: false }),
}));

const VIEW = 'Xem nhân viên';
const ADD = 'Thêm nhân viên';

describe('DashboardPage — RBAC-gated quick actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
    mockFullName = 'Test User';
  });

  it('shows both actions when the user can view and create employees', () => {
    mockPermissions = ['employees:view', 'employees:create'];
    render(<DashboardPage />);
    expect(screen.getByText(VIEW)).toBeInTheDocument();
    expect(screen.getByText(ADD)).toBeInTheDocument();
  });

  it('shows only "view" when the user can view but not create', () => {
    mockPermissions = ['employees:view'];
    render(<DashboardPage />);
    expect(screen.getByText(VIEW)).toBeInTheDocument();
    expect(screen.queryByText(ADD)).not.toBeInTheDocument();
  });

  it('shows only "add" when the user can create but not view the list', () => {
    mockPermissions = ['employees:create'];
    render(<DashboardPage />);
    expect(screen.queryByText(VIEW)).not.toBeInTheDocument();
    expect(screen.getByText(ADD)).toBeInTheDocument();
  });

  it('hides both actions when the user has neither permission', () => {
    mockPermissions = [];
    render(<DashboardPage />);
    expect(screen.queryByText(VIEW)).not.toBeInTheDocument();
    expect(screen.queryByText(ADD)).not.toBeInTheDocument();
  });

  it('falls back to a default name when the user has no fullName', () => {
    mockFullName = undefined;
    render(<DashboardPage />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Admin');
  });
});
