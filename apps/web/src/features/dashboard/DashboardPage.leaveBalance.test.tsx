import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { DashboardPage } from './DashboardPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// EMPLOYEE has no employee-management permissions → quick-action buttons hidden.
vi.mock('@/stores/auth.store', () => {
  const state = {
    user: {
      id: 'u-emp',
      fullName: 'Emp One',
      email: 'emp@example.com',
      role: 'EMPLOYEE',
      permissions: [],
    },
  };
  return { useAuthStore: (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state };
});

// EMPLOYEE self scope: backend populates myLeaveBalance + stats.myPendingRequests,
// and omits company-only blocks (departmentDistribution).
vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: {
      role: 'EMPLOYEE',
      stats: {
        totalActive: 1,
        onLeaveToday: 0,
        pendingApprovals: 2,
        newHiresThisMonth: 0,
        terminatedThisMonth: 0,
        departmentCount: 0,
        myPendingRequests: 2,
      },
      pendingLeave: [],
      upcomingEvents: [],
      myLeaveBalance: [
        {
          leaveType: { name: 'Nghỉ phép năm', colorHex: '#3B82F6' },
          allocated: 12,
          used: 4,
          remaining: 8,
        },
        {
          leaveType: { name: 'Nghỉ ốm', colorHex: '#EF4444' },
          allocated: 30,
          used: 0,
          remaining: 30,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

describe('DashboardPage — leave balance (EMPLOYEE self-service)', () => {
  it('renders the leave balance section heading', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Số ngày phép của tôi')).toBeInTheDocument();
  });

  it('renders a card per leave type with its name', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Nghỉ phép năm')).toBeInTheDocument();
    expect(screen.getByText('Nghỉ ốm')).toBeInTheDocument();
  });

  it('renders the remaining days prominently per leave type', () => {
    render(<DashboardPage />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders the used/allocated summary per leave type', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Đã dùng 4/12 ngày')).toBeInTheDocument();
    expect(screen.getByText('Đã dùng 0/30 ngày')).toBeInTheDocument();
  });

  it('hides employee-management quick actions without permission', () => {
    render(<DashboardPage />);
    expect(screen.queryByText('Xem nhân viên')).not.toBeInTheDocument();
    expect(screen.queryByText('Thêm nhân viên')).not.toBeInTheDocument();
  });
});
