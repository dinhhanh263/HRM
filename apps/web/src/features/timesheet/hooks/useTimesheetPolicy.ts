import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TimesheetPolicyDto,
  UpdateTimesheetPolicyRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const timesheetKeys = {
  all: ['timesheet'] as const,
  policy: () => [...timesheetKeys.all, 'policy'] as const,
};

export function useTimesheetPolicy() {
  return useQuery({
    queryKey: timesheetKeys.policy(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<TimesheetPolicyDto>>('/timesheet/policy');
      return res.data.data;
    },
  });
}

export function useUpdateTimesheetPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateTimesheetPolicyRequest) => {
      const res = await apiClient.patch<ApiResponse<TimesheetPolicyDto>>('/timesheet/policy', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.policy() });
    },
  });
}
