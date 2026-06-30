import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Download, Upload, Loader2, FileSpreadsheet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImportCustomers, downloadImportTemplate, type ImportResult } from '../hooks/useCustomers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerImportWizard({ open, onOpenChange }: Props) {
  const { t } = useTranslation('sales');
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const mut = useImportCustomers();

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function onFile(f: File) {
    setFile(f);
    try {
      const result = await mut.mutateAsync({ file: f, dryRun: true });
      setPreview(result);
    } catch {
      toast.error(t('import.toastError'));
      reset();
    }
  }

  async function commit() {
    if (!file) return;
    try {
      const result = await mut.mutateAsync({ file, dryRun: false });
      toast.success(t('import.toastDone', { count: result.created }));
      close();
    } catch {
      toast.error(t('import.toastError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.desc')}</DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4 py-2">
            <Button variant="outline" size="sm" onClick={() => void downloadImportTemplate()}>
              <Download size={14} className="mr-1.5" />
              {t('import.downloadTemplate')}
            </Button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-text-secondary hover:border-primary hover:text-primary transition-colors"
            >
              {mut.isPending ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  {t('import.analyzing')}
                </>
              ) : (
                <>
                  <Upload size={22} />
                  {t('import.chooseFile')}
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 text-sm">
              <FileSpreadsheet size={16} className="text-text-muted" />
              <span className="font-medium">{file?.name}</span>
            </div>
            <div className="flex gap-3">
              <Stat label={t('import.total')} value={preview.total} />
              <Stat label={t('import.valid')} value={preview.valid} tone="success" />
              <Stat label={t('import.skipped')} value={preview.skipped.length} tone={preview.skipped.length ? 'warning' : undefined} />
            </div>
            {preview.skipped.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                      <TableHead className="w-14 text-xs uppercase">{t('import.skippedCols.row')}</TableHead>
                      <TableHead className="text-xs uppercase">{t('import.skippedCols.name')}</TableHead>
                      <TableHead className="text-xs uppercase">{t('import.skippedCols.reason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.skipped.map((s) => (
                      <TableRow key={s.rowNumber} className="h-9">
                        <TableCell className="tabular-nums text-text-muted">{s.rowNumber}</TableCell>
                        <TableCell>{s.fullName || '—'}</TableCell>
                        <TableCell className="text-danger">{s.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {preview && (
            <Button variant="outline" onClick={reset} disabled={mut.isPending}>
              {t('import.another')}
            </Button>
          )}
          {preview && preview.valid > 0 && (
            <Button onClick={commit} disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('import.commit', { count: preview.valid })}
            </Button>
          )}
          {!preview && (
            <Button variant="outline" onClick={close}>
              {t('import.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-text-primary';
  return (
    <div className="flex-1 rounded-lg border border-border bg-surface p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}
