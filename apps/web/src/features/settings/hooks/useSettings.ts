import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  ApiResponse,
  PublicTenantSettings,
  SettingsAuditEntry,
  TenantSettingsDto,
  TenantSettingsSection,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/components/ui/toast';

export const settingsKeys = {
  all: ['tenant-settings'] as const,
  public: ['tenant-settings', 'public'] as const,
  audit: ['tenant-settings', 'audit'] as const,
};

export function useTenantSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<TenantSettingsDto>>('/settings');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

// Regional defaults for ANY authenticated user (calendar weekStart, default
// language) — separate endpoint because /settings itself is HR-only.
export function usePublicSettings() {
  return useQuery({
    queryKey: settingsKeys.public,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PublicTenantSettings>>('/settings/public');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSettingsAudit() {
  return useQuery({
    queryKey: settingsKeys.audit,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SettingsAuditEntry[]>>('/settings/audit');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export interface UpdateSettingsInput {
  section: TenantSettingsSection;
  payload: Record<string, unknown>;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('settings');
  return useMutation({
    mutationFn: async ({ section, payload }: UpdateSettingsInput) => {
      const res = await apiClient.patch<ApiResponse<TenantSettingsDto>>(
        `/settings/${section}`,
        payload
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
      queryClient.invalidateQueries({ queryKey: settingsKeys.public });
      queryClient.invalidateQueries({ queryKey: settingsKeys.audit });
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });
}
