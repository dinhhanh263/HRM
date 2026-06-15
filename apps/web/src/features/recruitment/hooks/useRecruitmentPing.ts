import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

interface RecruitmentPing {
  status: string;
  module: string;
}

export const recruitmentKeys = {
  all: ['recruitment'] as const,
  ping: () => [...recruitmentKeys.all, 'ping'] as const,
};

export function useRecruitmentPing() {
  return useQuery({
    queryKey: recruitmentKeys.ping(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RecruitmentPing>>('/recruitment/ping');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}
