import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  PaymentRequestDto,
  PaymentRequestListQuery,
  PaymentRequestListResponse,
  PaymentRequestAttachmentDto,
  PaymentStatsResponse,
  CreatePaymentRequestRequest,
  RejectPaymentRequestRequest,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const paymentKeys = {
  all: ['payment-request'] as const,
  requests: (filters: PaymentRequestListQuery) =>
    [...paymentKeys.all, 'requests', filters] as const,
  request: (id: string) => [...paymentKeys.all, 'request', id] as const,
  stats: (year: number) => [...paymentKeys.all, 'stats', year] as const,
};

export function usePaymentStats(year: number) {
  return useQuery({
    queryKey: paymentKeys.stats(year),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PaymentStatsResponse>>(
        `/payment-requests/stats?year=${year}`,
      );
      return res.data.data;
    },
  });
}

export function usePaymentRequests(filters: PaymentRequestListQuery = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: paymentKeys.requests(filters),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.scope) params.set('scope', filters.scope);
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      if (filters.minAmount !== undefined) params.set('minAmount', String(filters.minAmount));
      if (filters.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.search) params.set('search', filters.search);
      const res = await apiClient.get<ApiResponse<PaymentRequestListResponse>>(
        `/payment-requests?${params.toString()}`,
      );
      return res.data.data;
    },
  });
}

export function usePaymentRequest(id: string | null) {
  return useQuery({
    queryKey: paymentKeys.request(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PaymentRequestDto>>(`/payment-requests/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePaymentRequestRequest) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>('/payment-requests', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useUpdatePaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreatePaymentRequestRequest> }) => {
      const res = await apiClient.patch<ApiResponse<PaymentRequestDto>>(`/payment-requests/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useResubmitPaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreatePaymentRequestRequest }) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>(
        `/payment-requests/${id}/resubmit`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useApprovePaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>(`/payment-requests/${id}/approve`, {});
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useRespondPaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & RejectPaymentRequestRequest) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>(
        `/payment-requests/${id}/reject`,
        body,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useCancelPaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>(`/payment-requests/${id}/cancel`, {});
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useMarkPaidPaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paymentNote }: { id: string; paymentNote?: string }) => {
      const res = await apiClient.post<ApiResponse<PaymentRequestDto>>(
        `/payment-requests/${id}/mark-paid`,
        { paymentNote },
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useUploadPaymentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<PaymentRequestAttachmentDto>>(
        `/payment-requests/${id}/attachments`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

export function useDeletePaymentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attId }: { id: string; attId: string }) => {
      await apiClient.delete(`/payment-requests/${id}/attachments/${attId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentKeys.all }),
  });
}

/** Export the filtered payment requests to .xlsx and trigger a browser download. */
export async function exportPaymentRequests(filters: PaymentRequestListQuery): Promise<void> {
  const params = new URLSearchParams();
  if (filters.scope) params.set('scope', filters.scope);
  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.minAmount !== undefined) params.set('minAmount', String(filters.minAmount));
  if (filters.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search) params.set('search', filters.search);

  const res = await apiClient.get<Blob>(`/payment-requests/export?${params.toString()}`, {
    responseType: 'blob',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payment-requests-${filters.scope ?? 'mine'}-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download an attachment via the API (RBAC-checked) and trigger a browser save. */
export async function downloadPaymentAttachment(
  id: string,
  attachment: PaymentRequestAttachmentDto,
): Promise<void> {
  const res = await apiClient.get<Blob>(
    `/payment-requests/${id}/attachments/${attachment.id}/download`,
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
