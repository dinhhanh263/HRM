import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  BulkImportBatchDto,
  BulkImportConfirmResultDto,
  BulkImportItemDto,
  UpdateBulkImportItemRequest,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { applicationKeys } from './useApplications';

export const bulkImportKeys = {
  all: ['bulk-import'] as const,
  detail: (batchId: string) => [...bulkImportKeys.all, 'detail', batchId] as const,
};

/** Upload many CVs against a job. Returns the freshly-created DRAFT batch. */
export function useBulkUpload(jobId: string) {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      const res = await apiClient.post<ApiResponse<BulkImportBatchDto>>(
        `/recruitment/jobs/${jobId}/bulk-import`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
  });
}

/**
 * Read a batch and poll while any item is still parsing. Parsing runs in a
 * background worker, so we refetch every 2s until the batch leaves DRAFT (i.e.
 * every item is PARSED/PARSE_FAILED), then stop.
 */
export function useBulkImportBatch(batchId: string | null) {
  return useQuery({
    queryKey: bulkImportKeys.detail(batchId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<BulkImportBatchDto>>(
        `/recruitment/bulk-import/${batchId}`
      );
      return res.data.data;
    },
    enabled: !!batchId,
    refetchInterval: (query) => {
      const batch = query.state.data;
      return batch?.status === 'DRAFT' ? 2000 : false;
    },
  });
}

/** Edit one staged item (overlay reviewed fields and/or change resolution). */
export function useUpdateBulkItem(batchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { itemId: string; data: UpdateBulkImportItemRequest }) => {
      const res = await apiClient.patch<ApiResponse<BulkImportItemDto>>(
        `/recruitment/bulk-import/${batchId}/items/${vars.itemId}`,
        vars.data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bulkImportKeys.detail(batchId) });
    },
  });
}

/** Commit the batch: create/link candidates + applications. Non-atomic per item. */
export function useConfirmBulkImport(batchId: string, jobId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiResponse<BulkImportConfirmResultDto>>(
        `/recruitment/bulk-import/${batchId}/confirm`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bulkImportKeys.detail(batchId) });
      // New applications landed in the job's first stage — refresh its board.
      queryClient.invalidateQueries({ queryKey: applicationKeys.byJob(jobId) });
    },
  });
}

/** Cancel a batch: deletes staged files server-side and marks it CANCELLED. */
export function useCancelBulkImport(batchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete<ApiResponse<BulkImportBatchDto>>(
        `/recruitment/bulk-import/${batchId}`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bulkImportKeys.detail(batchId) });
    },
  });
}
