import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, QuoteDto, CreateQuoteRequest, UpdateQuoteRequest } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { saveBlob, filenameFromDisposition } from '@/lib/download';

export async function downloadQuotePdf(quoteId: string, code: string): Promise<void> {
  const res = await apiClient.get(`/sales/quotes/${quoteId}/pdf`, { responseType: 'blob' });
  const filename = filenameFromDisposition(res.headers['content-disposition'], `bao-gia-${code}.pdf`);
  saveBlob(res.data as Blob, filename);
}

export const quoteKeys = {
  all: ['sales', 'quotes'] as const,
  byDeal: (dealId: string) => [...quoteKeys.all, 'deal', dealId] as const,
};

export function useQuotes(dealId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: quoteKeys.byDeal(dealId ?? ''),
    enabled: Boolean(dealId) && enabled,
    queryFn: async () => (await apiClient.get<ApiResponse<QuoteDto[]>>(`/sales/deals/${dealId}/quotes`)).data.data,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales'] }); // quotes + deals (amount) both refresh
}

export function useCreateQuote(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateQuoteRequest) => (await apiClient.post<ApiResponse<QuoteDto>>(`/sales/deals/${dealId}/quotes`, body)).data.data,
    onSuccess: () => invalidate(qc),
  });
}
export function useUpdateQuote(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateQuoteRequest) => (await apiClient.patch<ApiResponse<QuoteDto>>(`/sales/quotes/${quoteId}`, body)).data.data,
    onSuccess: () => invalidate(qc),
  });
}
export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => { await apiClient.delete(`/sales/quotes/${quoteId}`); },
    onSuccess: () => invalidate(qc),
  });
}
