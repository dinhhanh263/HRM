import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, SalesStageDto, CreateStageRequest, UpdateStageRequest } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { getApiErrorCode } from '@/lib/api-error';
import { dealKeys } from './useDeals';

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: dealKeys.pipelines });
}

export function useCreateStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateStageRequest) => {
      const res = await apiClient.post<ApiResponse<SalesStageDto>>(`/sales/pipelines/${pipelineId}/stages`, body);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stageId, body }: { stageId: string; body: UpdateStageRequest }) => {
      const res = await apiClient.patch<ApiResponse<SalesStageDto>>(`/sales/pipelines/${pipelineId}/stages/${stageId}`, body);
      return res.data.data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stageId: string) => {
      await apiClient.delete(`/sales/pipelines/${pipelineId}/stages/${stageId}`);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useReorderStages(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await apiClient.put(`/sales/pipelines/${pipelineId}/stages/reorder`, { orderedIds });
    },
    onSuccess: () => invalidate(qc),
  });
}

export const isStageInUse = (err: unknown) => getApiErrorCode(err) === 'STAGE_IN_USE';
