import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useLogin, useRegister, useLogout, useRefreshAuth } from './useAuth';

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

const authPayload = { user: { id: 'u1', email: 'a@b.co' }, accessToken: 'tok-1' };

describe('useLogin', () => {
  it('posts credentials, stores the user, and navigates home', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: authPayload } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });
    result.current.mutate({ email: 'a@b.co', password: 'x' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/auth/login', { email: 'a@b.co', password: 'x' });
    expect(useAuthStore.getState().user).toEqual(authPayload.user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});

describe('useRegister', () => {
  it('posts the payload, stores the user, and navigates home', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: authPayload } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRegister(), { wrapper: Wrapper });
    result.current.mutate({ email: 'a@b.co' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/auth/register', { email: 'a@b.co' });
    expect(useAuthStore.getState().user).toEqual(authPayload.user);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});

describe('useLogout', () => {
  it('posts logout, clears the store, and navigates to login', async () => {
    useAuthStore.setState({ user: authPayload.user as never, isAuthenticated: true });
    mockPost.mockResolvedValue({ data: {} });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});

describe('useRefreshAuth', () => {
  it('refreshes the token then loads /auth/me into the store', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { accessToken: 'fresh' } } });
    mockGet.mockResolvedValue({ data: { success: true, data: { id: 'u1', email: 'a@b.co' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRefreshAuth(), { wrapper: Wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    await waitFor(() => expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'a@b.co' }));
  });

  it('logs out when the refresh fails', async () => {
    useAuthStore.setState({ user: authPayload.user as never, isAuthenticated: true });
    mockPost.mockRejectedValue(new Error('401'));
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRefreshAuth(), { wrapper: Wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
