import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveSettingsDto, UpdateLeaveSettingsRequest, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const leaveSettingsKeys = {
  all: ['leave-settings'] as const,
};

export function useLeaveSettings() {
  return useQuery({
    queryKey: leaveSettingsKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<LeaveSettingsDto>>('/leave/settings');
      return res.data.data;
    },
  });
}

export function useUpdateLeaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateLeaveSettingsRequest) => {
      const res = await apiClient.patch<ApiResponse<LeaveSettingsDto>>('/leave/settings', data);
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(leaveSettingsKeys.all, data);
    },
  });
}
