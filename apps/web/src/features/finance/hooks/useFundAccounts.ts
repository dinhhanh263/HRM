import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FundAccountDto,
  CreateFundAccountRequest,
  UpdateFundAccountRequest,
  FundAccountListQuery,
  IssuingEntityDto,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const fundAccountKeys = {
  all: ['fund-accounts'] as const,
  list: (query: FundAccountListQuery) => [...fundAccountKeys.all, 'list', query] as const,
};

export function useFundAccounts(query: FundAccountListQuery = {}) {
  return useQuery({
    queryKey: fundAccountKeys.list(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.issuingEntityId) params.set('issuingEntityId', query.issuingEntityId);
      if (query.active !== undefined) params.set('active', String(query.active));
      const qs = params.toString();
      const res = await apiClient.get<ApiResponse<FundAccountDto[]>>(
        `/fund-accounts${qs ? `?${qs}` : ''}`,
      );
      return res.data.data;
    },
  });
}

// Active issuing entities for the entity picker. The list endpoint accepts
// settings:view OR purchase_request:view/create — HR/Finance holds those.
export function useIssuingEntitiesLite() {
  return useQuery({
    queryKey: ['issuing-entities', 'lite'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<IssuingEntityDto[]>>(
        '/issuing-entities?activeOnly=1',
      );
      return res.data.data;
    },
  });
}

export function useCreateFundAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFundAccountRequest) => {
      const res = await apiClient.post<ApiResponse<FundAccountDto>>('/fund-accounts', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fundAccountKeys.all }),
  });
}

export function useUpdateFundAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateFundAccountRequest) => {
      const res = await apiClient.patch<ApiResponse<FundAccountDto>>(`/fund-accounts/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fundAccountKeys.all }),
  });
}

// Patch by id supplied at call time (used for the active/inactive toggle in the list).
export function useSetFundAccountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiClient.patch<ApiResponse<FundAccountDto>>(`/fund-accounts/${id}`, { active });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fundAccountKeys.all }),
  });
}

export function useDeleteFundAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/fund-accounts/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fundAccountKeys.all }),
  });
}
