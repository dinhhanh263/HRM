import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FinanceCategoryDto,
  CreateFinanceCategoryRequest,
  UpdateFinanceCategoryRequest,
  FinanceCategoryListQuery,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const financeCategoryKeys = {
  all: ['finance-categories'] as const,
  list: (query: FinanceCategoryListQuery) => [...financeCategoryKeys.all, 'list', query] as const,
};

export function useFinanceCategories(query: FinanceCategoryListQuery = {}) {
  return useQuery({
    queryKey: financeCategoryKeys.list(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.kind) params.set('kind', query.kind);
      if (query.active !== undefined) params.set('active', String(query.active));
      const qs = params.toString();
      const res = await apiClient.get<ApiResponse<FinanceCategoryDto[]>>(
        `/finance-categories${qs ? `?${qs}` : ''}`,
      );
      return res.data.data;
    },
  });
}

export function useCreateFinanceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFinanceCategoryRequest) => {
      const res = await apiClient.post<ApiResponse<FinanceCategoryDto>>('/finance-categories', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: financeCategoryKeys.all }),
  });
}

export function useUpdateFinanceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & UpdateFinanceCategoryRequest) => {
      const res = await apiClient.patch<ApiResponse<FinanceCategoryDto>>(`/finance-categories/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: financeCategoryKeys.all }),
  });
}

export function useDeleteFinanceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/finance-categories/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: financeCategoryKeys.all }),
  });
}
