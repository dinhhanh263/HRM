import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ApiResponse, AuthResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { markLogin } from '@/lib/session-persistence';
import { AuthShell } from '../components/AuthShell';

/**
 * Landing page for the Google SSO callback (`/auth/google/success`).
 *
 * The backend has already verified the Google identity and set the httpOnly
 * `__session` refresh cookie before bouncing the browser here. This page exchanges
 * that cookie for an access token via `/auth/refresh`, loads the user, then
 * enters the app. Any failure routes to `/login?error=sso` with neutral copy.
 */
export function GoogleCallbackPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  // StrictMode mounts effects twice in dev — guard so we only exchange once.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const refresh = await apiClient.post<ApiResponse<{ accessToken: string }>>(
          '/auth/refresh',
        );
        const accessToken = refresh.data.data.accessToken;
        const me = await apiClient.get<ApiResponse<AuthResponse['user']>>('/auth/me');
        // Google SSO issues a persistent refresh cookie (server-side), so the
        // session should survive a browser restart.
        markLogin(true);
        setUser(me.data.data, accessToken);
        navigate('/', { replace: true });
      } catch {
        navigate('/login?error=sso', { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <div className="text-sm text-text-secondary">{t('googleCallback.signingIn')}</div>
      </div>
    </AuthShell>
  );
}
