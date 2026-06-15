import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, DashboardData } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const dashboardKeys = {
  all: ['dashboard'] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DashboardData>>('/dashboard');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}
