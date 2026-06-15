import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PayrollRunDto,
  PayrollRunListQuery,
  CreatePayrollRunRequest,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { payrollKeys } from './usePayrollSettings';

export const runKeys = {
  list: (query: PayrollRunListQuery) => [...payrollKeys.all, 'runs', 'list', query] as const,
  detail: (id: string) => [...payrollKeys.all, 'runs', 'detail', id] as const,
};

interface RunListResult {
  rows: PayrollRunDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useRuns(query: PayrollRunListQuery) {
  return useQuery({
    queryKey: runKeys.list(query),
    queryFn: async (): Promise<RunListResult> => {
      const res = await apiClient.get<PaginatedResponse<PayrollRunDto>>('/payroll/runs', {
        params: query,
      });
      return { rows: res.data.data, pagination: res.data.pagination };
    },
  });
}

// A single run with its payslip lines (the detail endpoint includes payslips).
// HR-only drill-in; the list rows carry totals, this carries the breakdown.
export function useRun(id: string | null) {
  return useQuery({
    queryKey: runKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<PayrollRunDto> => {
      const res = await apiClient.get<ApiResponse<PayrollRunDto>>(`/payroll/runs/${id}`);
      return res.data.data;
    },
  });
}

function invalidateRuns(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'runs'] });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePayrollRunRequest) => {
      const res = await apiClient.post<ApiResponse<PayrollRunDto>>('/payroll/runs', data);
      return res.data.data;
    },
    onSuccess: () => invalidateRuns(queryClient),
  });
}

// The lifecycle transitions share the same shape: POST a run action, then
// refresh the list. Status guards + permissions are enforced server-side
// (409 on illegal moves, 403 on missing permission).
function useRunAction(action: 'recompute' | 'submit' | 'approve' | 'reject' | 'mark-paid' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<PayrollRunDto>>(
        `/payroll/runs/${id}/${action}`,
      );
      return res.data.data;
    },
    onSuccess: () => invalidateRuns(queryClient),
  });
}

export const useRecomputeRun = () => useRunAction('recompute');
export const useSubmitRun = () => useRunAction('submit');
export const useApproveRun = () => useRunAction('approve');
export const useRejectRun = () => useRunAction('reject');
export const useMarkRunPaid = () => useRunAction('mark-paid');
export const useCancelRun = () => useRunAction('cancel');

/**
 * Export an entire run's payslips as a single multi-page PDF. HR-only
 * (payroll:export) — enforced server-side. Streamed as a blob and saved.
 */
export function useExportRunPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.get(`/payroll/runs/${id}/export`, { responseType: 'blob' });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `payroll-${id}.pdf`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}
