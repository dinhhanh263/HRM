import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  AssetImportResult,
  AssetImportValidationSummary,
  ImportLang,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { assetKeys } from './useAssets';

export type AssetTemplateFormat = 'xlsx' | 'csv';

export interface DownloadAssetTemplateOptions {
  format?: AssetTemplateFormat;
  lang?: ImportLang;
}

/**
 * Download a blank asset-import template (xlsx or csv) in the requested language.
 * Streamed as a blob and saved client-side; returns the saved filename.
 */
export function useDownloadAssetTemplate() {
  return useMutation({
    mutationFn: async (options: DownloadAssetTemplateOptions | void) => {
      const { format = 'xlsx', lang = 'vi' } = options ?? {};
      const res = await apiClient.get('/assets/import/template', {
        params: { format, lang },
        responseType: 'blob',
      });
      const fallback = `asset-import-template.${format}`;
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        fallback,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

/**
 * Dry-run validation of an uploaded file. Writes nothing; returns a per-row
 * preview with inline errors. When every row is valid, `importId` is staged
 * server-side for the atomic `/import` confirm step (null otherwise).
 */
export function useValidateAssetImport() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<AssetImportValidationSummary>>(
        '/assets/import/validate',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  });
}

/**
 * Commit a previously-validated import atomically (all-or-nothing). On success
 * the asset list is invalidated so the new rows appear immediately.
 */
export function useConfirmAssetImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      const res = await apiClient.post<ApiResponse<AssetImportResult>>('/assets/import', {
        importId,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}
