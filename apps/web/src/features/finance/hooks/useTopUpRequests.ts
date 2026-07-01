import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TopUpRequestDto,
  TopUpRequestListQuery,
  CreateTopUpRequest,
  ReviewTopUpRequest,
  TopUpJustificationDraft,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { fundAccountKeys } from './useFundAccounts';

export const topUpKeys = {
  all: ['topup-requests'] as const,
  list: (q: TopUpRequestListQuery) => [...topUpKeys.all, 'list', q] as const,
};

export function useTopUpRequests(query: TopUpRequestListQuery = {}) {
  return useQuery({
    queryKey: topUpKeys.list(query),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (query.status) p.set('status', query.status);
      if (query.issuingEntityId) p.set('issuingEntityId', query.issuingEntityId);
      const qs = p.toString();
      const res = await apiClient.get<ApiResponse<TopUpRequestDto[]>>(`/topup-requests${qs ? `?${qs}` : ''}`);
      return res.data.data;
    },
  });
}

// On-demand: fetch a suggested justification (not a query — triggered by a button).
export function useJustificationDraft() {
  return useMutation({
    mutationFn: async (args: { issuingEntityId?: string; month?: string }) => {
      const p = new URLSearchParams();
      if (args.issuingEntityId) p.set('issuingEntityId', args.issuingEntityId);
      if (args.month) p.set('month', args.month);
      const res = await apiClient.get<ApiResponse<TopUpJustificationDraft>>(`/topup-requests/justification-draft?${p.toString()}`);
      return res.data.data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: topUpKeys.all });
  qc.invalidateQueries({ queryKey: fundAccountKeys.all }); // approve may change a balance
}

export function useCreateTopUpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTopUpRequest) => {
      const res = await apiClient.post<ApiResponse<TopUpRequestDto>>('/topup-requests', data);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useCancelTopUpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<TopUpRequestDto>>(`/topup-requests/${id}/cancel`, {});
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDownloadTopUpPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.get(`/topup-requests/${id}/pdf`, { responseType: 'blob' });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `de-xuat-nap-quy-${id}.pdf`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

export function useReviewTopUpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & ReviewTopUpRequest) => {
      const res = await apiClient.post<ApiResponse<TopUpRequestDto>>(`/topup-requests/${id}/review`, data);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}
