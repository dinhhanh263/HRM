import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  ApiResponse,
  MyAccountDto,
  MySessionDto,
  UpdateMyProfileRequest,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/components/ui/toast';
import { getApiErrorCode } from '@/lib/api-error';

export const accountKeys = {
  me: ['account', 'me'] as const,
  sessions: ['account', 'sessions'] as const,
};

export function useMyAccount() {
  return useQuery({
    queryKey: accountKeys.me,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MyAccountDto>>('/account');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('account');
  return useMutation({
    mutationFn: async (payload: UpdateMyProfileRequest) => {
      const res = await apiClient.patch<ApiResponse<MyAccountDto>>('/account/profile', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(accountKeys.me, data);
      toast.success(t('toast.profileSaved'));
    },
    onError: () => toast.error(t('toast.error')),
  });
}

export function useChangePassword() {
  const { t } = useTranslation('account');
  return useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      await apiClient.post('/auth/change-password', payload);
    },
    onSuccess: () => toast.success(t('toast.passwordChanged')),
    onError: (error) => {
      const code = getApiErrorCode(error);
      toast.error(t('toast.passwordError'), {
        description: code === 'UNAUTHORIZED' ? t('toast.wrongCurrent') : undefined,
      });
    },
  });
}

export function useMySessions() {
  return useQuery({
    queryKey: accountKeys.sessions,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MySessionDto[]>>('/account/sessions');
      return res.data.data;
    },
    staleTime: 10_000,
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('account');
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiResponse<{ revoked: number }>>(
        '/account/sessions/revoke-others'
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: accountKeys.sessions });
      toast.success(t('toast.sessionsRevoked', { count: data.revoked }));
    },
    onError: () => toast.error(t('toast.error')),
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('account');
  return useMutation({
    mutationFn: async (payload: Record<string, boolean>) => {
      const res = await apiClient.patch<ApiResponse<MyAccountDto>>(
        '/account/notifications',
        payload
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(accountKeys.me, data);
      toast.success(t('toast.prefsSaved'));
    },
    onError: () => toast.error(t('toast.error')),
  });
}
