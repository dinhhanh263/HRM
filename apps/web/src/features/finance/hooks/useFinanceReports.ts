import { useQuery } from '@tanstack/react-query';
import type { BudgetVsActualResponse, ForecastResponse, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

interface ReportQuery {
  issuingEntityId?: string;
  month?: string;
}

function qs(query: ReportQuery): string {
  const p = new URLSearchParams();
  if (query.issuingEntityId) p.set('issuingEntityId', query.issuingEntityId);
  if (query.month) p.set('month', query.month);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useBudgetVsActual(query: ReportQuery = {}) {
  return useQuery({
    queryKey: ['finance-budget-vs-actual', query],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<BudgetVsActualResponse>>(`/finance/budget-vs-actual${qs(query)}`);
      return res.data.data;
    },
  });
}

export function useFinanceForecast(query: ReportQuery = {}) {
  return useQuery({
    queryKey: ['finance-forecast', query],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ForecastResponse>>(`/finance/forecast${qs(query)}`);
      return res.data.data;
    },
  });
}
