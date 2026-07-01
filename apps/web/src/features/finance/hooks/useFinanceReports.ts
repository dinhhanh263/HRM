import { useQuery, useMutation } from '@tanstack/react-query';
import type { BudgetVsActualResponse, ForecastResponse, FinanceReportResponse, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';

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

function reportQs(q: { year?: number; issuingEntityId?: string }): string {
  const p = new URLSearchParams();
  if (q.year) p.set('year', String(q.year));
  if (q.issuingEntityId) p.set('issuingEntityId', q.issuingEntityId);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useFinanceReport(query: { year?: number; issuingEntityId?: string } = {}) {
  return useQuery({
    queryKey: ['finance-report', query],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<FinanceReportResponse>>(`/finance/report${reportQs(query)}`);
      return res.data.data;
    },
  });
}

export function useDownloadFinanceReport() {
  return useMutation({
    mutationFn: async (query: { year?: number; issuingEntityId?: string }) => {
      const res = await apiClient.get(`/finance/report/export${reportQs(query)}`, { responseType: 'blob' });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `bao-cao-tai-chinh-${query.year ?? ''}.xlsx`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}
