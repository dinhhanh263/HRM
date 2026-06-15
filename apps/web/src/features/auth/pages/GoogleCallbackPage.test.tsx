import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { GoogleCallbackPage } from './GoogleCallbackPage';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

const user = { id: 'u1', email: 'active@codecrush.asia', fullName: 'Active' };

describe('GoogleCallbackPage', () => {
  it('exchanges the refresh cookie, loads the user, and enters the app', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { accessToken: 'tok-1' } } });
    mockGet.mockResolvedValue({ data: { success: true, data: user } });

    render(<GoogleCallbackPage />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('routes to the neutral login error when the refresh fails', async () => {
    mockPost.mockRejectedValue(new Error('no cookie'));

    render(<GoogleCallbackPage />);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/login?error=sso', { replace: true }),
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows a loading indicator while exchanging', () => {
    mockPost.mockReturnValue(new Promise(() => {})); // never resolves
    render(<GoogleCallbackPage />);
    expect(screen.getByText(/Đang đăng nhập bằng Google/)).toBeInTheDocument();
  });
});
