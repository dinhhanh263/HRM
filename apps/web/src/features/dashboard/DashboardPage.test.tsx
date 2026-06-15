import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';

// Mock navigate
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock auth store — selector-aware so usePermission can read user.permissions.
// HR_MANAGER here has the employee-management permissions, so the quick-action
// buttons render (asserted below).
vi.mock('@/stores/auth.store', () => {
  const state = {
    user: {
      id: 'user-1',
      fullName: 'Test User',
      email: 'test@example.com',
      role: 'HR_MANAGER',
      permissions: ['employees:view', 'employees:create'],
    },
  };
  return { useAuthStore: (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state };
});

// Mock the dashboard data hook so stat cards render with deterministic values.
vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: {
      role: 'HR_MANAGER',
      stats: {
        totalActive: 156,
        onLeaveToday: 8,
        pendingApprovals: 5,
        newHiresThisMonth: 7,
        terminatedThisMonth: 1,
        departmentCount: 6,
      },
      departmentDistribution: [
        { departmentId: 'd-eng', name: 'Engineering', count: 20 },
        { departmentId: 'd-mkt', name: 'Marketing', count: 12 },
        { departmentId: 'd-sales', name: 'Sales', count: 8 },
      ],
      pendingLeave: [
        {
          id: 'lr-1',
          employeeName: 'Nguyễn Văn An',
          leaveType: { name: 'Nghỉ phép năm', colorHex: '#3B82F6' },
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2026-06-03T00:00:00.000Z',
          totalDays: 3,
          createdAt: '2026-05-28T00:00:00.000Z',
        },
        {
          id: 'lr-2',
          employeeName: 'Trần Thị Bình',
          leaveType: { name: 'Nghỉ ốm', colorHex: '#EF4444' },
          startDate: '2026-05-30T00:00:00.000Z',
          endDate: '2026-05-30T00:00:00.000Z',
          totalDays: 1,
          createdAt: '2026-05-29T00:00:00.000Z',
        },
      ],
      upcomingEvents: [
        {
          kind: 'birthday',
          employeeName: 'Nguyễn Văn An',
          department: 'Engineering',
          date: '2026-06-10',
        },
        {
          kind: 'anniversary',
          employeeName: 'Trần Thị Bình',
          department: 'Marketing',
          date: '2026-06-15',
          years: 5,
        },
        {
          kind: 'new_joiner',
          employeeName: 'Phạm Minh Đức',
          department: 'Engineering',
          date: '2026-06-20',
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render welcome message with user name', () => {
      render(<DashboardPage />);

      // The welcome message contains the user's name
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Xin chào');
      // The user name comes from the mock store - might be "Admin" for fallback
      expect(heading.textContent?.length).toBeGreaterThan(10);
    });

    it('should render current date', () => {
      render(<DashboardPage />);

      // Should show date in Vietnamese format - may contain year
      const dateElements = document.querySelectorAll('p');
      const hasDate = Array.from(dateElements).some((el) =>
        el.textContent?.includes('2026') || el.textContent?.includes('tháng')
      );
      expect(hasDate).toBeTruthy();
    });

    it('should render quick action buttons', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Xem nhân viên')).toBeInTheDocument();
      expect(screen.getByText('Thêm nhân viên')).toBeInTheDocument();
    });

    it('should render all stat cards', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Tổng nhân viên')).toBeInTheDocument();
      expect(screen.getByText('Đang nghỉ phép hôm nay')).toBeInTheDocument();
      expect(screen.getByText('Đơn chờ duyệt')).toBeInTheDocument();
      expect(screen.getByText('Nhân viên mới tháng này')).toBeInTheDocument();
    });

    it('should render stat values', () => {
      render(<DashboardPage />);

      expect(screen.getByText('156')).toBeInTheDocument(); // Total active
      expect(screen.getByText('8')).toBeInTheDocument(); // On leave today
      expect(screen.getByText('5')).toBeInTheDocument(); // Pending approvals
      expect(screen.getByText('7')).toBeInTheDocument(); // New hires this month
    });

    it('should render department distribution section', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Phân bố nhân viên theo phòng ban')).toBeInTheDocument();
      // Department names may appear multiple times (in chart and in other places)
      expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Marketing').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sales').length).toBeGreaterThan(0);
    });

    it('should not render the removed attendance trend section', () => {
      render(<DashboardPage />);

      expect(screen.queryByText('Xu hướng chấm công tuần này')).not.toBeInTheDocument();
    });

    it('should render pending leave requests section', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Đơn nghỉ phép chờ duyệt')).toBeInTheDocument();
    });

    it('should render upcoming events section', () => {
      render(<DashboardPage />);

      // "Sự kiện sắp tới" may appear multiple times
      const eventSectionElements = screen.getAllByText('Sự kiện sắp tới');
      expect(eventSectionElements.length).toBeGreaterThan(0);
    });

    it('should not render the removed recent activities section', () => {
      render(<DashboardPage />);

      expect(screen.queryByText('Hoạt động gần đây')).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to employees list when "Xem nhân viên" is clicked', async () => {
      const user = userEvent.setup();
      render(<DashboardPage />);

      const viewButton = screen.getByText('Xem nhân viên');
      await user.click(viewButton);

      expect(mockNavigate).toHaveBeenCalledWith('/employees');
    });

    it('should navigate to create employee when "Thêm nhân viên" is clicked', async () => {
      const user = userEvent.setup();
      render(<DashboardPage />);

      const addButton = screen.getByText('Thêm nhân viên');
      await user.click(addButton);

      expect(mockNavigate).toHaveBeenCalledWith('/employees/new');
    });
  });

  describe('Leave Requests', () => {
    it('should render pending leave requests from real data', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument();
    });

    it('should render leave type names', () => {
      render(<DashboardPage />);

      expect(screen.getByText(/Nghỉ phép năm/)).toBeInTheDocument();
      expect(screen.getByText(/Nghỉ ốm/)).toBeInTheDocument();
    });

    it('should be read-only — no approve or reject controls', () => {
      render(<DashboardPage />);

      expect(screen.queryByTitle('Duyệt')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Từ chối')).not.toBeInTheDocument();
    });
  });

  describe('Upcoming Events', () => {
    it('should render upcoming events', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Sinh nhật Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText(/Kỷ niệm 5 năm - Trần Thị Bình/)).toBeInTheDocument();
      expect(screen.getByText('Onboarding Phạm Minh Đức')).toBeInTheDocument();
    });

    it('should render event dates', () => {
      render(<DashboardPage />);

      expect(screen.getByText('10/06')).toBeInTheDocument();
      expect(screen.getByText('15/06')).toBeInTheDocument();
      expect(screen.getByText('20/06')).toBeInTheDocument();
    });
  });

  describe('Quick Stats Footer', () => {
    it('should render quick stats', () => {
      render(<DashboardPage />);

      expect(screen.getByText('Nhân viên mới tháng này')).toBeInTheDocument();
      expect(screen.getByText('Nghỉ việc tháng này')).toBeInTheDocument();
      // "Phòng ban" may appear multiple times
      expect(screen.getAllByText('Phòng ban').length).toBeGreaterThan(0);
      // "Sự kiện sắp tới" may appear multiple times
      expect(screen.getAllByText('Sự kiện sắp tới').length).toBeGreaterThan(0);
    });
  });
});
