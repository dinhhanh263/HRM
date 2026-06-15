import { useMutation } from '@tanstack/react-query';
import type { ImportLang } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export type ImportTemplateFormat = 'xlsx' | 'csv';

export interface DownloadTemplateOptions {
  format?: ImportTemplateFormat;
  lang?: ImportLang;
}

/** Pull the filename out of a Content-Disposition header, with a fallback. */
function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return match?.[1] ?? fallback;
}

/** Trigger a browser "save file" for an in-memory blob. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download a blank employee-import template (xlsx or csv) in the requested
 * language. Returns a mutation so the wizard can show pending state and toast
 * on error. The file is streamed as a blob and saved client-side.
 */
export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: async (options: DownloadTemplateOptions | void) => {
      const { format = 'xlsx', lang = 'vi' } = options ?? {};
      const res = await apiClient.get('/employees/import/template', {
        params: { format, lang },
        responseType: 'blob',
      });
      const fallback = `employee-import-template.${format}`;
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        fallback,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}
