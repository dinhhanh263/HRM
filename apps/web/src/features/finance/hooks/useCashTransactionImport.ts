import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  CashTxImportLang,
  CashTxImportParseResult,
  CashTxImportConfirmResult,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { cashTransactionKeys } from './useCashTransactions';
import { fundAccountKeys } from './useFundAccounts';

export type CashTxTemplateFormat = 'xlsx' | 'csv';

export function useDownloadCashTxTemplate() {
  return useMutation({
    mutationFn: async (options: { format?: CashTxTemplateFormat; lang?: CashTxImportLang } | void) => {
      const { format = 'xlsx', lang = 'vi' } = options ?? {};
      const res = await apiClient.get('/cash-transactions/import/template', {
        params: { format, lang },
        responseType: 'blob',
      });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `cash-transaction-import-template.${format}`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

// Stateless dry-run — returns a per-row preview, writes nothing.
export function useParseCashTxImport() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<CashTxImportParseResult>>(
        '/cash-transactions/import/parse',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  });
}

// Confirm — re-parses server-side and inserts valid rows; refresh ledger + balances.
export function useConfirmCashTxImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<CashTxImportConfirmResult>>(
        '/cash-transactions/import/confirm',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cashTransactionKeys.all });
      qc.invalidateQueries({ queryKey: fundAccountKeys.all });
    },
  });
}
