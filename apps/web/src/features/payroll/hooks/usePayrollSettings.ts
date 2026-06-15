import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PayrollSettingsDto,
  UpdatePayrollSettingsRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const payrollKeys = {
  all: ['payroll'] as const,
  settings: () => [...payrollKeys.all, 'settings'] as const,
};

export function usePayrollSettings() {
  return useQuery({
    queryKey: payrollKeys.settings(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PayrollSettingsDto>>('/payroll/settings');
      return res.data.data;
    },
  });
}

export function useUpdatePayrollSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdatePayrollSettingsRequest) => {
      const res = await apiClient.patch<ApiResponse<PayrollSettingsDto>>('/payroll/settings', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollKeys.settings() });
    },
  });
}
