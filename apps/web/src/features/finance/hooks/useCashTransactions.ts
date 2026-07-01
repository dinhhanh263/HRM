import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CashTransactionListResponse,
  CashTransactionListQuery,
  CreateCashTransactionRequest,
  UpdateCashTransactionRequest,
  CashTransactionDto,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { fundAccountKeys } from './useFundAccounts';

export const cashTransactionKeys = {
  all: ['cash-transactions'] as const,
  list: (query: CashTransactionListQuery) => [...cashTransactionKeys.all, 'list', query] as const,
};

function buildParams(query: CashTransactionListQuery): string {
  const p = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  };
  set('issuingEntityId', query.issuingEntityId);
  set('accountId', query.accountId);
  set('categoryId', query.categoryId);
  set('departmentId', query.departmentId);
  set('direction', query.direction);
  set('status', query.status);
  set('dateFrom', query.dateFrom);
  set('dateTo', query.dateTo);
  set('search', query.search);
  set('page', query.page);
  set('limit', query.limit);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export function useCashTransactions(query: CashTransactionListQuery = {}) {
  return useQuery({
    queryKey: cashTransactionKeys.list(query),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CashTransactionListResponse>>(
        `/cash-transactions${buildParams(query)}`,
      );
      return res.data.data;
    },
  });
}

// Both fund-account balances and the ledger change together — invalidate both.
function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: cashTransactionKeys.all });
  qc.invalidateQueries({ queryKey: fundAccountKeys.all });
}

export function useCreateCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCashTransactionRequest) => {
      const res = await apiClient.post<ApiResponse<CashTransactionDto>>('/cash-transactions', data);
      return res.data.data;
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useUpdateCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & UpdateCashTransactionRequest) => {
      const res = await apiClient.patch<ApiResponse<CashTransactionDto>>(`/cash-transactions/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useDeleteCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/cash-transactions/${id}`);
    },
    onSuccess: () => invalidateFinance(qc),
  });
}
