import { useEffect } from 'react';
import type { ApiResponse, UserDto } from '@hrm/shared';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient, refreshAccessToken } from '@/lib/api-client';
import {
  shouldResumeSession,
  markSessionActive,
  clearSessionMarkers,
} from '@/lib/session-persistence';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    async function initAuth() {
      // A "remember me" cookie can outlive the browser session, but a
      // session-only login must not auto-resume after the browser closes —
      // even if the browser kept the cookie. Skip the silent refresh unless our
      // own markers say this session should resume.
      if (!shouldResumeSession()) {
        setLoading(false);
        return;
      }

      try {
        const accessToken = await refreshAccessToken();

        const meRes = await apiClient.get<ApiResponse<UserDto>>('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        setUser(meRes.data.data, accessToken);
        markSessionActive();
      } catch {
        clearSessionMarkers();
        setLoading(false);
      }
    }

    initAuth();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
