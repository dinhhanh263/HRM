import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  DealDto,
  SalesPipelineDto,
  CreateDealRequest,
  UpdateDealRequest,
  DealStatus,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const dealKeys = {
  all: ['sales', 'deals'] as const,
  list: (f: Record<string, string | undefined>) => [...dealKeys.all, 'list', f] as const,
  pipelines: ['sales', 'pipelines'] as const,
};

export function usePipelines() {
  return useQuery({
    queryKey: dealKeys.pipelines,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SalesPipelineDto[]>>('/sales/pipelines');
      return res.data.data;
    },
  });
}

export function useDeals(filters: { pipelineId?: string; status?: DealStatus; search?: string }) {
  return useQuery({
    queryKey: dealKeys.list(filters),
    enabled: Boolean(filters.pipelineId),
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await apiClient.get<ApiResponse<DealDto[]>>(`/sales/deals?${params}`);
      return res.data.data;
    },
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDealRequest) => {
      const res = await apiClient.post<ApiResponse<DealDto>>('/sales/deals', body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKeys.all }),
  });
}

export function useUpdateDeal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateDealRequest) => {
      const res = await apiClient.patch<ApiResponse<DealDto>>(`/sales/deals/${id}`, body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKeys.all }),
  });
}

export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toStageId }: { id: string; toStageId: string }) => {
      const res = await apiClient.post<ApiResponse<DealDto>>(`/sales/deals/${id}/move`, { toStageId });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKeys.all }),
  });
}

export function useWinDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<DealDto>>(`/sales/deals/${id}/win`);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useLoseDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lostReason }: { id: string; lostReason: string }) => {
      const res = await apiClient.post<ApiResponse<DealDto>>(`/sales/deals/${id}/lose`, { lostReason });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}
