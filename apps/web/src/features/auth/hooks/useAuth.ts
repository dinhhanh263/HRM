import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { LoginRequest, RegisterRequest, AuthResponse, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { markLogin, markSessionActive, clearSessionMarkers } from '@/lib/session-persistence';

export function useLogin() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const res = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', data);
      return res.data.data;
    },
    onSuccess: (data, variables) => {
      markLogin(variables.rememberMe ?? false);
      setUser(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const res = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', data);
      return res.data.data;
    },
    onSuccess: (data) => {
      // Registration issues a persistent refresh cookie (server-side), so the
      // session should survive a browser restart like a "remember me" login.
      markLogin(true);
      setUser(data.user, data.accessToken);
      navigate('/');
    },
  });
}

interface SetPasswordRequest {
  token: string;
  password: string;
}

export function useSetPassword() {
  return useMutation({
    mutationFn: async (data: SetPasswordRequest) => {
      // No tokens are returned — the user must sign in afterwards.
      await apiClient.post<ApiResponse<{ user: AuthResponse['user'] }>>(
        '/auth/set-password',
        data,
      );
    },
  });
}

interface ForgotPasswordRequest {
  email: string;
  tenantSlug: string;
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: ForgotPasswordRequest) => {
      // Always resolves 200 server-side (no account enumeration) — success just
      // means the request was accepted, not that an email was actually sent.
      await apiClient.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data);
    },
  });
}

interface ResetPasswordRequest {
  token: string;
  password: string;
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (data: ResetPasswordRequest) => {
      // No tokens are returned — the user must sign in with the new password.
      await apiClient.post<ApiResponse<{ user: AuthResponse['user'] }>>(
        '/auth/reset-password',
        data,
      );
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout');
    },
    onSuccess: () => {
      clearSessionMarkers();
      logout();
      navigate('/login');
    },
  });
}

export function useRefreshAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiResponse<{ accessToken: string }>>('/auth/refresh');
      return res.data.data;
    },
    onSuccess: async (data) => {
      const meRes = await apiClient.get<ApiResponse<AuthResponse['user']>>('/auth/me');
      setUser(meRes.data.data, data.accessToken);
      markSessionActive();
    },
    onError: () => {
      clearSessionMarkers();
      logout();
    },
  });
}
