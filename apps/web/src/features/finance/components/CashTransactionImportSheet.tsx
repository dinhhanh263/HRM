import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CashTxImportParseResult } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useDownloadCashTxTemplate,
  useParseCashTxImport,
  useConfirmCashTxImport,
} from '../hooks/useCashTransactionImport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CashTransactionImportSheet({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CashTxImportParseResult | null>(null);

  const downloadTemplate = useDownloadCashTxTemplate();
  const parseImport = useParseCashTxImport();
  const confirmImport = useConfirmCashTxImport();

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    parseImport.mutate(f, {
      onSuccess: setPreview,
      onError: () => toast.error(t('import.toast.parseError')),
    });
  }

  function handleConfirm() {
    if (!file) return;
    confirmImport.mutate(file, {
      onSuccess: (r) => {
        toast.success(t('import.toast.done', { created: r.created, skipped: r.skipped }));
        reset();
        onOpenChange(false);
      },
      onError: () => toast.error(t('import.toast.confirmError')),
    });
  }

  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const fileErrors = preview?.fileErrors ?? [];
  const canConfirm = preview && preview.validCount > 0 && fileErrors.length === 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent className="flex flex-col w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('import.title')}</SheetTitle>
          <SheetDescription>{t('import.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          {/* Step 1: template */}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => downloadTemplate.mutate({ format: 'xlsx', lang })}
            disabled={downloadTemplate.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('import.downloadTemplate')}
          </Button>

          {/* Step 2: pick file */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:bg-surface-alt transition-colors"
          >
            <FileSpreadsheet className="w-8 h-8 text-text-muted" />
            <p className="text-sm text-text-secondary">{file ? file.name : t('import.pickFile')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {parseImport.isPending && <p className="text-sm text-text-muted">{t('import.parsing')}</p>}

          {/* File-level errors */}
          {fileErrors.length > 0 && (
            <div className="rounded-lg bg-danger-light p-3 text-sm text-danger">
              {fileErrors.map((e, i) => (
                <p key={i} className="flex items-center gap-1.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  {e.message}
                </p>
              ))}
            </div>
          )}

          {/* Preview summary */}
          {preview && fileErrors.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-text-secondary">
                  {t('import.summary.total')}: <span className="font-semibold tabular-nums">{preview.totalRows}</span>
                </span>
                <span className="text-success">
                  {t('import.summary.valid')}: <span className="font-semibold tabular-nums">{preview.validCount}</span>
                </span>
                <span className={preview.errorCount > 0 ? 'text-danger' : 'text-text-muted'}>
                  {t('import.summary.errors')}: <span className="font-semibold tabular-nums">{preview.errorCount}</span>
                </span>
              </div>

              {preview.errorCount > 0 && (
                <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-alt sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-text-secondary w-12">{t('import.table.row')}</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-text-secondary">{t('import.table.error')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows
                        .filter((r) => r.errors.length > 0)
                        .map((r) => (
                          <tr key={r.rowNumber} className="border-t border-border">
                            <td className="px-2 py-1.5 tabular-nums text-text-muted align-top">{r.rowNumber}</td>
                            <td className="px-2 py-1.5 text-danger">
                              {r.errors.map((e, i) => (
                                <div key={i}>{e.message}</div>
                              ))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errorCount > 0 && (
                <p className="text-xs text-text-muted">{t('import.onlyValidNote')}</p>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm || confirmImport.isPending}>
            {confirmImport.isPending ? (
              tc('states.saving')
            ) : (
              <>
                {preview && preview.validCount > 0 ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {t('import.confirm', { count: preview?.validCount ?? 0 })}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
