import { useMutation } from '@tanstack/react-query';
import type {
  ApiResponse,
  ImportLang,
  PRItemImportParseResult,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';

export type PRItemTemplateFormat = 'xlsx' | 'csv';

export interface DownloadPRItemTemplateOptions {
  format?: PRItemTemplateFormat;
  lang?: ImportLang;
}

/**
 * Download a blank line-item import template (xlsx or csv) in the requested
 * language. Streamed as a blob and saved client-side; returns the saved filename.
 */
export function useDownloadPRItemTemplate() {
  return useMutation({
    mutationFn: async (options: DownloadPRItemTemplateOptions | void) => {
      const { format = 'xlsx', lang = 'vi' } = options ?? {};
      const res = await apiClient.get('/purchase-requests/import/template', {
        params: { format, lang },
        responseType: 'blob',
      });
      const fallback = `purchase-item-import-template.${format}`;
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
 * Parse an uploaded file into line items. Pure dry-run — writes nothing and
 * returns the clean items inline for the caller to merge into the form, plus a
 * per-row error report. No query invalidation (no server state changes).
 */
export function useParsePRItems() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<PRItemImportParseResult>>(
        '/purchase-requests/import/parse',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  });
}
