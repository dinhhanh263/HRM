import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  PurchaseRequestDto,
  PurchaseRequestListQuery,
  PurchaseRequestListResponse,
  PurchaseRequestAttachmentDto,
  PurchaseStatsResponse,
  CreatePurchaseRequestRequest,
  RejectPurchaseRequestRequest,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const purchaseKeys = {
  all: ['purchase-request'] as const,
  requests: (filters: PurchaseRequestListQuery) =>
    [...purchaseKeys.all, 'requests', filters] as const,
  request: (id: string) => [...purchaseKeys.all, 'request', id] as const,
  stats: (year: number) => [...purchaseKeys.all, 'stats', year] as const,
};

export function usePurchaseStats(year: number) {
  return useQuery({
    queryKey: purchaseKeys.stats(year),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PurchaseStatsResponse>>(
        `/purchase-requests/stats?year=${year}`,
      );
      return res.data.data;
    },
  });
}

export function usePurchaseRequests(
  filters: PurchaseRequestListQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: purchaseKeys.requests(filters),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.scope) params.set('scope', filters.scope);
      if (filters.status) params.set('status', filters.status);
      if (filters.vendorName) params.set('vendorName', filters.vendorName);
      if (filters.minAmount !== undefined) params.set('minAmount', String(filters.minAmount));
      if (filters.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.search) params.set('search', filters.search);
      const res = await apiClient.get<ApiResponse<PurchaseRequestListResponse>>(
        `/purchase-requests?${params.toString()}`,
      );
      return res.data.data;
    },
  });
}

export function usePurchaseRequest(id: string | null) {
  return useQuery({
    queryKey: purchaseKeys.request(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PurchaseRequestDto>>(`/purchase-requests/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePurchaseRequestRequest) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>('/purchase-requests', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useUpdatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreatePurchaseRequestRequest> }) => {
      const res = await apiClient.patch<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useResubmitPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreatePurchaseRequestRequest }) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}/resubmit`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useApprovePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}/approve`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useRespondPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & RejectPurchaseRequestRequest) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}/reject`,
        body,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useCancelPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}/cancel`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useMarkOrderedPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderNote }: { id: string; orderNote?: string }) => {
      const res = await apiClient.post<ApiResponse<PurchaseRequestDto>>(
        `/purchase-requests/${id}/mark-ordered`,
        { orderNote },
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useUploadPurchaseAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<PurchaseRequestAttachmentDto>>(
        `/purchase-requests/${id}/attachments`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

export function useDeletePurchaseAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attId }: { id: string; attId: string }) => {
      await apiClient.delete(`/purchase-requests/${id}/attachments/${attId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  });
}

/** Export the filtered purchase requests to .xlsx and trigger a browser download. */
export async function exportPurchaseRequests(filters: PurchaseRequestListQuery): Promise<void> {
  const params = new URLSearchParams();
  if (filters.scope) params.set('scope', filters.scope);
  if (filters.status) params.set('status', filters.status);
  if (filters.vendorName) params.set('vendorName', filters.vendorName);
  if (filters.minAmount !== undefined) params.set('minAmount', String(filters.minAmount));
  if (filters.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search) params.set('search', filters.search);

  const res = await apiClient.get<Blob>(`/purchase-requests/export?${params.toString()}`, {
    responseType: 'blob',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `purchase-requests-${filters.scope ?? 'mine'}-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download an attachment via the API (RBAC-checked) and trigger a browser save. */
export async function downloadPurchaseAttachment(
  id: string,
  attachment: PurchaseRequestAttachmentDto,
): Promise<void> {
  const res = await apiClient.get<Blob>(
    `/purchase-requests/${id}/attachments/${attachment.id}/download`,
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

/** Fetch the PO PDF (RBAC-checked) and trigger a browser save as `<code>.pdf`. */
export async function downloadPurchasePdf(id: string, code: string): Promise<void> {
  const res = await apiClient.get<Blob>(`/purchase-requests/${id}/pdf`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
