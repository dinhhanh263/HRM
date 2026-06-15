import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssetImportResult,
  AssetImportRowError,
  AssetImportValidationSummary,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/theme.store';
import {
  useConfirmAssetImport,
  useDownloadAssetTemplate,
  useValidateAssetImport,
} from '../hooks/useAssetImport';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Check,
} from 'lucide-react';

type WizardStep = 'upload' | 'review' | 'done';

const STEP_ORDER: WizardStep[] = ['upload', 'review', 'done'];

interface AssetImportWizardProps {
  /** The trigger button is rendered by the wizard so callers just drop it in. */
  className?: string;
}

/** Translate a backend error code to a human label, falling back to the raw message. */
function useErrorCodeLabel() {
  const { t } = useTranslation('assetImport');
  return (err: AssetImportRowError): string => {
    const key = `code.${err.code}`;
    const label = t(key);
    // i18next returns the key itself when missing — fall back to server message.
    return label === key ? err.message : label;
  };
}

export function AssetImportWizard({ className }: AssetImportWizardProps) {
  const { t } = useTranslation('assetImport');
  const labelFor = useErrorCodeLabel();
  const lang = useThemeStore((s) => s.language);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<AssetImportValidationSummary | null>(null);
  const [result, setResult] = useState<AssetImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = useDownloadAssetTemplate();
  const validate = useValidateAssetImport();
  const confirm = useConfirmAssetImport();

  function resetState() {
    setStep('upload');
    setFile(null);
    setSummary(null);
    setResult(null);
    validate.reset();
    confirm.reset();
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Defer reset so the close animation doesn't flash the upload step.
      setTimeout(resetState, 200);
    }
  }

  function handleDownload(format: 'xlsx' | 'csv') {
    downloadTemplate.mutate(
      { format, lang },
      {
        onSuccess: () => toast.success(t('template.downloaded')),
        onError: () => toast.error(t('template.downloadError')),
      },
    );
  }

  function handleValidate() {
    if (!file) {
      toast.error(t('errors.fileRequired'));
      return;
    }
    validate.mutate(file, {
      onSuccess: (data) => {
        setSummary(data);
        setStep('review');
      },
      onError: () => toast.error(t('errors.validateFailed')),
    });
  }

  function handleConfirm() {
    if (!summary?.importId) return;
    confirm.mutate(summary.importId, {
      onSuccess: (data) => {
        setResult(data);
        setStep('done');
      },
      onError: () => toast.error(t('errors.confirmFailed')),
    });
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4 mr-2" />
        {t('trigger')}
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl flex flex-col gap-0 overflow-hidden p-0"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{t('description')}</SheetDescription>

            {/* Step indicator */}
            <ol className="flex items-center gap-2 pt-3">
              {STEP_ORDER.map((s, i) => {
                const isDone = i < stepIndex;
                const isCurrent = i === stepIndex;
                return (
                  <li key={s} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex items-center justify-center size-6 rounded-full text-xs font-semibold transition-colors',
                        isDone && 'bg-primary text-primary-foreground',
                        isCurrent && 'bg-primary/10 text-primary ring-1 ring-primary',
                        !isDone && !isCurrent && 'bg-surface-alt text-text-muted',
                      )}
                    >
                      {isDone ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium hidden sm:inline',
                        isCurrent ? 'text-text-primary' : 'text-text-muted',
                      )}
                    >
                      {t(`steps.${s}`)}
                    </span>
                    {i < STEP_ORDER.length - 1 && (
                      <span className="w-4 h-px bg-border hidden sm:inline" />
                    )}
                  </li>
                );
              })}
            </ol>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <UploadStep
                file={file}
                onPickFile={() => fileInputRef.current?.click()}
                fileInputRef={fileInputRef}
                onFileChange={(f) => setFile(f)}
                onDownload={handleDownload}
                downloading={downloadTemplate.isPending}
              />
            )}

            {step === 'review' && summary && (
              <ReviewStep summary={summary} labelFor={labelFor} />
            )}

            {step === 'done' && <DoneStep result={result} />}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
            {step === 'upload' && (
              <Button onClick={handleValidate} disabled={!file || validate.isPending}>
                {validate.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {validate.isPending ? t('upload.validating') : t('upload.validate')}
              </Button>
            )}

            {step === 'review' && summary && (
              <>
                <Button variant="outline" onClick={() => setStep('upload')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('review.back')}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!summary.importId || confirm.isPending}
                >
                  {confirm.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {confirm.isPending
                    ? t('review.confirming')
                    : t('review.confirm', { count: summary.validCount })}
                </Button>
              </>
            )}

            {step === 'done' && (
              <Button onClick={() => handleOpenChange(false)}>
                {t('actions.close', { ns: 'common' })}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

interface UploadStepProps {
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPickFile: () => void;
  onFileChange: (file: File | null) => void;
  onDownload: (format: 'xlsx' | 'csv') => void;
  downloading: boolean;
}

function UploadStep({
  file,
  fileInputRef,
  onPickFile,
  onFileChange,
  onDownload,
  downloading,
}: UploadStepProps) {
  const { t } = useTranslation('assetImport');
  return (
    <div className="space-y-6">
      {/* Template */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{t('template.title')}</h3>
        <p className="text-xs text-text-muted">{t('template.hint')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => onDownload('xlsx')}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {t('template.downloadXlsx')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => onDownload('csv')}
          >
            <FileText className="w-4 h-4 mr-2" />
            {t('template.downloadCsv')}
          </Button>
        </div>
      </section>

      {/* Upload */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{t('upload.title')}</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        <div
          className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-background px-4 py-4 cursor-pointer hover:border-primary transition-colors"
          onClick={onPickFile}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPickFile()}
        >
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Upload className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary truncate">
              {file ? file.name : t('upload.empty')}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{t('upload.formats')}</p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" tabIndex={-1}>
            {file ? t('upload.change') : t('upload.choose')}
          </Button>
        </div>
      </section>

      {/* All-or-nothing note */}
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
        <AlertTriangle className="size-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary">{t('upload.atomicHint')}</p>
      </div>
    </div>
  );
}

interface ReviewStepProps {
  summary: AssetImportValidationSummary;
  labelFor: (e: AssetImportRowError) => string;
}

function ReviewStep({ summary, labelFor }: ReviewStepProps) {
  const { t } = useTranslation('assetImport');
  const isClean = summary.errorCount === 0 && summary.fileErrors.length === 0;

  // Flatten file-level errors + per-row errors into a single report table.
  const allErrors = useMemo<AssetImportRowError[]>(
    () => [...summary.fileErrors, ...summary.rows.flatMap((r) => r.errors)],
    [summary],
  );

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('review.totalRows')} value={summary.totalRows} tone="neutral" />
        <StatCard label={t('review.valid')} value={summary.validCount} tone="success" />
        <StatCard label={t('review.errors')} value={summary.errorCount} tone="danger" />
      </div>

      {/* Will-import / must-fix banner */}
      {isClean ? (
        <div className="flex items-start gap-2 rounded-lg bg-success-light border border-success/30 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
          <p className="text-xs text-success">
            {t('review.willImport', { count: summary.validCount })}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-danger-light border border-danger/30 px-3 py-2.5">
          <AlertTriangle className="size-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{t('review.mustFix')}</p>
        </div>
      )}

      {/* Error table */}
      {allErrors.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">{t('review.errorsTitle')}</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt">
                <tr className="text-left text-text-muted">
                  <th className="font-semibold uppercase tracking-wide px-3 py-2 w-14">
                    {t('review.colRow')}
                  </th>
                  <th className="font-semibold uppercase tracking-wide px-3 py-2 w-28">
                    {t('review.colColumn')}
                  </th>
                  <th className="font-semibold uppercase tracking-wide px-3 py-2">
                    {t('review.colMessage')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allErrors.map((err, i) => (
                  <tr key={`${err.row}-${err.column ?? ''}-${i}`} className="text-text-secondary">
                    <td className="px-3 py-2 tabular-nums">{err.row || '—'}</td>
                    <td className="px-3 py-2">
                      {err.column ? t(`columns.${err.column}`) : '—'}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{labelFor(err)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={cn(
          'text-xl font-bold tabular-nums mt-0.5',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'neutral' && 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DoneStep({ result }: { result: AssetImportResult | null }) {
  const { t } = useTranslation('assetImport');
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="size-12 rounded-full bg-success-light flex items-center justify-center mb-4">
          <CheckCircle2 className="size-6 text-success" />
        </div>
        <h3 className="text-sm font-semibold text-text-primary">{t('done.title')}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t('done.created')} value={result?.created ?? 0} tone="success" />
        <StatCard
          label={t('done.assignmentsCreated')}
          value={result?.assignmentsCreated ?? 0}
          tone="neutral"
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
        <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary">{t('done.successHint')}</p>
      </div>
    </div>
  );
}
