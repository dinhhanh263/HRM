import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SpendingPlanDto,
  SpendingPlanListQuery,
  CreateSpendingPlanRequest,
  UpdateSpendingPlanRequest,
  ReviewSpendingPlanRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const spendingPlanKeys = {
  all: ['spending-plans'] as const,
  list: (q: SpendingPlanListQuery) => [...spendingPlanKeys.all, 'list', q] as const,
};

export function useSpendingPlans(query: SpendingPlanListQuery = {}) {
  return useQuery({
    queryKey: spendingPlanKeys.list(query),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (query.scope) p.set('scope', query.scope);
      if (query.period) p.set('period', query.period);
      if (query.departmentId) p.set('departmentId', query.departmentId);
      if (query.issuingEntityId) p.set('issuingEntityId', query.issuingEntityId);
      if (query.status) p.set('status', query.status);
      const qs = p.toString();
      const res = await apiClient.get<ApiResponse<SpendingPlanDto[]>>(`/spending-plans${qs ? `?${qs}` : ''}`);
      return res.data.data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: spendingPlanKeys.all });
}

export function useCreateSpendingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSpendingPlanRequest) => {
      const res = await apiClient.post<ApiResponse<SpendingPlanDto>>('/spending-plans', data);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSpendingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & UpdateSpendingPlanRequest) => {
      const res = await apiClient.patch<ApiResponse<SpendingPlanDto>>(`/spending-plans/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSubmitSpendingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<SpendingPlanDto>>(`/spending-plans/${id}/submit`, {});
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useReviewSpendingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & ReviewSpendingPlanRequest) => {
      const res = await apiClient.post<ApiResponse<SpendingPlanDto>>(`/spending-plans/${id}/review`, data);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}
