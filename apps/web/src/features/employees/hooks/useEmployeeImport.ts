import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ApiResponse,
  ImportJobStatus,
  ImportOptions,
  ImportValidationSummary,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export interface ValidateImportInput {
  file: File;
  options: ImportOptions;
}

/**
 * Dry-run validation of an uploaded file. Returns a per-row error report and,
 * when at least one row is valid, an `importId` staged server-side for `/import`.
 */
export function useValidateImport() {
  return useMutation({
    mutationFn: async ({ file, options }: ValidateImportInput) => {
      const form = new FormData();
      form.append('file', file);
      form.append('autoCreateOrgUnits', String(options.autoCreateOrgUnits));
      const res = await apiClient.post<ApiResponse<ImportValidationSummary>>(
        '/employees/import/validate',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  });
}

/** Confirm a staged import — enqueues the background job and returns its status. */
export function useStartImport() {
  return useMutation({
    mutationFn: async (importId: string) => {
      const res = await apiClient.post<ApiResponse<ImportJobStatus>>('/employees/import', {
        importId,
      });
      return res.data.data;
    },
  });
}

/** True while the job has not reached a terminal state. */
function isRunning(state: ImportJobStatus['state'] | undefined): boolean {
  return state === 'waiting' || state === 'active';
}

/**
 * Poll an import job's progress until it reaches a terminal state. Polling stops
 * automatically once the job is `completed` or `failed`. Disabled until a
 * `jobId` is provided.
 */
export function useImportStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['employee-import-status', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ImportJobStatus>>(`/employees/import/${jobId}`);
      return res.data.data;
    },
    // Poll every second while running; stop once finished.
    refetchInterval: (query) => (isRunning(query.state.data?.state) ? 1000 : false),
  });
}
