import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { DashboardData } from '@hrm/shared';
import { DashboardPage } from './DashboardPage';

// Mutable across tests: each case sets the role-scoped payload the server would
// return, then asserts the layout adapts (widgets shown/hidden by role).
let mockData: DashboardData;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/stores/auth.store', () => {
  const state = {
    user: { id: 'u', fullName: 'Test User', email: 't@e.com', permissions: [] as string[] },
  };
  return { useAuthStore: (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state };
});

vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => ({ data: mockData, isLoading: false, isError: false }),
}));

const baseStats = {
  totalActive: 10,
  onLeaveToday: 1,
  pendingApprovals: 2,
  newHiresThisMonth: 1,
  terminatedThisMonth: 0,
  departmentCount: 3,
};

// Section headings used as layout probes (vi locale).
const DEPT = 'Phân bố nhân viên theo phòng ban';
const STATS = 'Tổng nhân viên';
const FOOTER = 'Nghỉ việc tháng này';
const LEAVE_BALANCE = 'Số ngày phép của tôi';
const ATTENDANCE = 'Xu hướng chấm công tuần này';
const RECENT = 'Hoạt động gần đây';

describe('DashboardPage — role-adaptive layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HR_MANAGER (company scope)', () => {
    beforeEach(() => {
      mockData = {
        role: 'HR_MANAGER',
        stats: baseStats,
        departmentDistribution: [{ departmentId: 'd-eng', name: 'Engineering', count: 5 }],
        pendingLeave: [],
        upcomingEvents: [],
      };
    });

    it('renders company widgets: stats grid, department distribution, footer', () => {
      render(<DashboardPage />);
      expect(screen.getByText(STATS)).toBeInTheDocument();
      expect(screen.getByText(DEPT)).toBeInTheDocument();
      expect(screen.getByText(FOOTER)).toBeInTheDocument();
    });

    it('does not render removed dummy widgets (attendance trend, recent activity)', () => {
      render(<DashboardPage />);
      expect(screen.queryByText(ATTENDANCE)).not.toBeInTheDocument();
      expect(screen.queryByText(RECENT)).not.toBeInTheDocument();
    });

    it('does not render the employee leave-balance widget', () => {
      render(<DashboardPage />);
      expect(screen.queryByText(LEAVE_BALANCE)).not.toBeInTheDocument();
    });
  });

  describe('MANAGER (team scope)', () => {
    beforeEach(() => {
      mockData = {
        role: 'MANAGER',
        stats: baseStats,
        // team scope: server omits company-only department distribution
        pendingLeave: [],
        upcomingEvents: [],
      };
    });

    it('renders the team stats grid', () => {
      render(<DashboardPage />);
      expect(screen.getByText(STATS)).toBeInTheDocument();
    });

    it('does not render company-only widgets (department distribution, footer)', () => {
      render(<DashboardPage />);
      expect(screen.queryByText(DEPT)).not.toBeInTheDocument();
      expect(screen.queryByText(FOOTER)).not.toBeInTheDocument();
    });

    it('does not render the employee leave-balance widget', () => {
      render(<DashboardPage />);
      expect(screen.queryByText(LEAVE_BALANCE)).not.toBeInTheDocument();
    });
  });

  describe('EMPLOYEE (self scope)', () => {
    beforeEach(() => {
      mockData = {
        role: 'EMPLOYEE',
        stats: { ...baseStats, totalActive: 1, myPendingRequests: 2 },
        pendingLeave: [],
        upcomingEvents: [],
        myLeaveBalance: [
          { leaveType: { name: 'Nghỉ phép năm', colorHex: '#3B82F6' }, allocated: 12, used: 4, remaining: 8 },
        ],
      };
    });

    it('renders the self-service leave-balance widget', () => {
      render(<DashboardPage />);
      expect(screen.getByText(LEAVE_BALANCE)).toBeInTheDocument();
    });

    it('does not render company widgets (stats grid, department distribution, footer)', () => {
      render(<DashboardPage />);
      expect(screen.queryByText(STATS)).not.toBeInTheDocument();
      expect(screen.queryByText(DEPT)).not.toBeInTheDocument();
      expect(screen.queryByText(FOOTER)).not.toBeInTheDocument();
    });
  });
});
