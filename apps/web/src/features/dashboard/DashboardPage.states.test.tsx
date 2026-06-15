import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { DashboardData } from '@hrm/shared';
import { DashboardPage } from './DashboardPage';

// Mutable query state: loading shows a skeleton (aria-busy), error shows an
// alert, success renders the data. These are the three states every data-backed
// surface must handle (CLAUDE: skeleton over spinner, inline error, no dead-end).
let mockState: { data?: DashboardData; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: true,
  isError: false,
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { id: 'u', fullName: 'Test User', email: 'u@e.com', permissions: [] } };
    return selector ? selector(state) : state;
  },
}));

vi.mock('./hooks/useDashboard', () => ({
  useDashboard: () => mockState,
}));

describe('DashboardPage — query states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading skeleton while fetching', () => {
    mockState = { data: undefined, isLoading: true, isError: false };
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders an error alert when the query fails', () => {
    mockState = { data: undefined, isLoading: false, isError: true };
    render(<DashboardPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('Không thể tải dữ liệu bảng điều khiển. Vui lòng thử lại.'),
    ).toBeInTheDocument();
  });
});
