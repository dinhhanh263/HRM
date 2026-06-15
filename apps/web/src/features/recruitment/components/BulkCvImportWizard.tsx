import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  BULK_IMPORT_MAX_FILES,
  type ApiError,
  type BulkImportConfirmResultDto,
  type BulkImportItemDto,
  type BulkImportItemResolution,
  type ParsedResume,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import {
  useBulkUpload,
  useBulkImportBatch,
  useUpdateBulkItem,
  useConfirmBulkImport,
  useCancelBulkImport,
} from '../hooks/useBulkImport';

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface BulkCvImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
}

type Phase = 'upload' | 'review' | 'done';

export function BulkCvImportWizard({ open, onOpenChange, jobId }: BulkCvImportWizardProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState<BulkImportConfirmResultDto['summary'] | null>(null);

  const upload = useBulkUpload(jobId);
  const { data: batch } = useBulkImportBatch(phase === 'review' ? batchId : null);
  const confirm = useConfirmBulkImport(batchId ?? '', jobId);
  const cancel = useCancelBulkImport(batchId ?? '');

  // Fresh state every time the wizard opens — never carry a stale batch across sessions.
  useEffect(() => {
    if (open) {
      setPhase('upload');
      setBatchId(null);
      setFiles([]);
      setSummary(null);
    }
  }, [open]);

  const isParsing = batch?.status === 'DRAFT';
  const items = batch?.items ?? [];
  const parsedCount = items.filter((it) => it.status !== 'PARSING').length;

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const next = [...files, ...Array.from(picked)];
    if (next.length > BULK_IMPORT_MAX_FILES) {
      toast.error(t('bulkImport.toast.tooManyFiles', { max: BULK_IMPORT_MAX_FILES }));
      return;
    }
    setFiles(next);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    try {
      const created = await upload.mutateAsync(files);
      setBatchId(created.id);
      setPhase('review');
    } catch (err) {
      const code = (err as AxiosError<ApiError>).response?.data?.error?.code;
      if (code === 'BULK_IMPORT_TOO_MANY_FILES') {
        toast.error(t('bulkImport.toast.tooManyFiles', { max: BULK_IMPORT_MAX_FILES }));
      } else if (code === 'CV_UNSUPPORTED_TYPE') {
        toast.error(t('bulkImport.toast.unsupported'));
      } else if (code === 'CV_FILE_TOO_LARGE') {
        toast.error(t('bulkImport.toast.tooLarge'));
      } else {
        toast.error(t('bulkImport.toast.uploadError'));
      }
    }
  }

  async function handleConfirm() {
    try {
      const result = await confirm.mutateAsync();
      setSummary(result.summary);
      setPhase('done');
      if (result.summary.created > 0) {
        toast.success(t('bulkImport.toast.confirmSuccess', { created: result.summary.created }));
      }
    } catch {
      toast.error(t('bulkImport.toast.confirmError'));
    }
  }

  function handleOpenChange(next: boolean) {
    // Abandoning an un-confirmed batch: tell the server to drop its staged files.
    if (!next && phase === 'review' && batchId) {
      cancel.mutate();
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-2xl gap-0">
        <SheetHeader>
          <SheetTitle>{t('bulkImport.title')}</SheetTitle>
          <SheetDescription>{t('bulkImport.description')}</SheetDescription>
        </SheetHeader>

        {phase === 'upload' && (
          <div className="mt-6 flex-1 overflow-y-auto space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-alt/50 py-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <UploadCloud size={22} className="text-primary" strokeWidth={1.5} />
              </div>
              <span className="text-sm font-medium text-text-primary">
                {t('bulkImport.upload.dropHint')}
              </span>
              <span className="text-xs text-text-muted">
                {t('bulkImport.upload.accept', { max: BULK_IMPORT_MAX_FILES })}
              </span>
            </button>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-text-secondary tabular-nums">
                    {t('bulkImport.upload.selectedCount', { count: files.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-xs text-text-muted hover:text-danger transition-colors"
                  >
                    {t('bulkImport.upload.clear')}
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <FileText size={15} className="text-text-muted shrink-0" />
                      <span className="text-sm text-text-primary truncate flex-1">{f.name}</span>
                      <button
                        type="button"
                        aria-label={t('bulkImport.upload.removeFile')}
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                        className="text-text-muted hover:text-danger transition-colors shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div className="mt-6 flex-1 overflow-y-auto space-y-3">
            {!batch ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                {isParsing && (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-text-secondary">
                    <Loader2 size={15} className="animate-spin text-primary" />
                    <span className="tabular-nums">
                      {t('bulkImport.review.parsing', {
                        done: parsedCount,
                        total: items.length,
                      })}
                    </span>
                  </div>
                )}
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <BulkItemRow key={item.id} item={item} batchId={batchId!} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {phase === 'done' && summary && (
          <div className="mt-6 flex-1 overflow-y-auto">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="size-14 rounded-2xl bg-success-light flex items-center justify-center mb-4">
                <CheckCircle2 size={26} className="text-success" strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-text-primary mb-1">{t('bulkImport.done.title')}</h3>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <SummaryCard label={t('bulkImport.done.created')} value={summary.created} />
              <SummaryCard label={t('bulkImport.done.linked')} value={summary.linked} />
              <SummaryCard label={t('bulkImport.done.skipped')} value={summary.skipped} />
              <SummaryCard
                label={t('bulkImport.done.failed')}
                value={summary.failed}
                danger={summary.failed > 0}
              />
            </dl>
          </div>
        )}

        <SheetFooter className="mt-6">
          {phase === 'upload' && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={files.length === 0 || upload.isPending}
              >
                {upload.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {t('bulkImport.upload.start')}
              </Button>
            </>
          )}
          {phase === 'review' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={cancel.isPending}
              >
                {t('bulkImport.review.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isParsing || confirm.isPending || items.length === 0}
              >
                {confirm.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {t('bulkImport.review.confirm')}
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('bulkImport.done.close')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SummaryCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 tabular-nums ${
          danger ? 'text-danger' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const RESOLUTIONS: BulkImportItemResolution[] = ['NEW', 'LINK_EXISTING', 'SKIP'];

function BulkItemRow({ item, batchId }: { item: BulkImportItemDto; batchId: string }) {
  const { t } = useTranslation('recruitment');
  const update = useUpdateBulkItem(batchId);

  const base = item.reviewed ?? item.parsed;
  const [fullName, setFullName] = useState(base?.fullName ?? '');
  const [email, setEmail] = useState(base?.email ?? '');
  const [phone, setPhone] = useState(base?.phone ?? '');

  const parsing = item.status === 'PARSING';
  const failed = item.parseStatus === 'FAILED';

  // Persist edited fields, preserving the rest of the reviewed payload.
  function saveFields() {
    const current = item.reviewed ?? item.parsed ?? { skills: [] };
    const reviewed: ParsedResume = {
      ...current,
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    if (
      reviewed.fullName === current.fullName &&
      reviewed.email === current.email &&
      reviewed.phone === current.phone
    ) {
      return;
    }
    update.mutate({ itemId: item.id, data: { reviewed } });
  }

  function changeResolution(resolution: BulkImportItemResolution) {
    update.mutate({ itemId: item.id, data: { resolution } });
  }

  const showName = useMemo(() => fullName.trim().length > 0, [fullName]);

  if (parsing) {
    return (
      <li className="rounded-lg border border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Loader2 size={15} className="animate-spin text-primary shrink-0" />
          <span className="text-sm text-text-secondary truncate">{item.fileName}</span>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-background p-3 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={14} className="text-text-muted shrink-0" />
        <span className="text-xs text-text-muted truncate flex-1">{item.fileName}</span>
        {!item.hasText && (
          <Badge
            variant="outline"
            className="text-[11px] gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            <AlertCircle size={11} />
            {t('bulkImport.review.noText')}
          </Badge>
        )}
      </div>

      {failed ? (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle size={12} />
          {t('bulkImport.review.parseFailed')}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={saveFields}
            placeholder={t('bulkImport.review.fullName')}
            className="h-8 text-sm"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={saveFields}
            placeholder={t('bulkImport.review.email')}
            className="h-8 text-sm"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={saveFields}
            placeholder={t('bulkImport.review.phone')}
            className="h-8 text-sm"
          />
        </div>
      )}

      {!failed && !showName && (
        <p className="text-[11px] text-text-muted">{t('bulkImport.review.noName')}</p>
      )}

      {item.duplicateOfCandidateId && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle size={11} />
          {t('bulkImport.review.duplicate')}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Select
          value={item.resolution}
          onValueChange={(v) => changeResolution(v as BulkImportItemResolution)}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTIONS.map((r) => (
              <SelectItem
                key={r}
                value={r}
                disabled={r === 'LINK_EXISTING' && !item.duplicateOfCandidateId}
              >
                {t(`bulkImport.review.resolution.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {update.isPending && <Loader2 size={13} className="animate-spin text-text-muted" />}
      </div>
    </li>
  );
}
