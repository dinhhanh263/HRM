import { useQuery } from '@tanstack/react-query';
import type { FinanceDashboardResponse, FinanceDashboardQuery, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export function useFinanceDashboard(query: FinanceDashboardQuery = {}) {
  return useQuery({
    queryKey: ['finance-dashboard', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.issuingEntityId) params.set('issuingEntityId', query.issuingEntityId);
      if (query.month) params.set('month', query.month);
      const qs = params.toString();
      const res = await apiClient.get<ApiResponse<FinanceDashboardResponse>>(
        `/finance/dashboard${qs ? `?${qs}` : ''}`,
      );
      return res.data.data;
    },
  });
}
