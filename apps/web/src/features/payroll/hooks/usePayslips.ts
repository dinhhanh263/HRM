import { useQuery, useMutation } from '@tanstack/react-query';
import type {
  PayslipDto,
  PayslipListQuery,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { payrollKeys } from './usePayrollSettings';

export const payslipKeys = {
  mine: (query: PayslipListQuery) => [...payrollKeys.all, 'payslips', 'mine', query] as const,
  detail: (id: string) => [...payrollKeys.all, 'payslips', 'detail', id] as const,
};

interface MyPayslipsResult {
  rows: PayslipDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** The caller's own payslips (APPROVED/PAID only — enforced server-side). */
export function useMyPayslips(query: PayslipListQuery) {
  return useQuery({
    queryKey: payslipKeys.mine(query),
    queryFn: async (): Promise<MyPayslipsResult> => {
      const res = await apiClient.get<PaginatedResponse<PayslipDto>>('/payroll/payslips/me', {
        params: query,
      });
      return { rows: res.data.data, pagination: res.data.pagination };
    },
  });
}

/** A single payslip by id. Self-scope (own + issued) or HR is enforced server-side. */
export function usePayslip(id: string | null) {
  return useQuery({
    queryKey: payslipKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<PayslipDto> => {
      const res = await apiClient.get<ApiResponse<PayslipDto>>(`/payroll/payslips/${id}`);
      return res.data.data;
    },
  });
}

/**
 * Download a single payslip as a PDF. Self-scope (own + issued) or HR is
 * enforced server-side; the file is streamed as a blob and saved client-side.
 */
export function useDownloadPayslipPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.get(`/payroll/payslips/${id}/pdf`, { responseType: 'blob' });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `payslip-${id}.pdf`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}
