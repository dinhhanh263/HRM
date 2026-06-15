import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import {
  Download,
  FileText,
  Loader2,
  Upload,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Check,
} from 'lucide-react';
import type {
  ApiError,
  CandidateAttachmentDto,
  ParsedResume,
  ParseStatus,
  UpdateCandidateRequest,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import {
  useCandidateAttachments,
  useUploadCv,
  useReparseCv,
  downloadAttachment,
} from '../hooks/useCandidateAttachments';
import { useUpdateCandidate } from '../hooks/useCandidates';

interface CvUploaderProps {
  candidateId: string;
}

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PARSE_STATUS_CLASS: Record<ParseStatus, string> = {
  PENDING:
    'border-border bg-surface-alt text-text-muted',
  PROCESSING:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  DONE: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  FAILED:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
};

// Build a partial candidate patch from the parser's suggestion, keeping only
// the fields that actually carry a value. Never overwrites with blanks.
function buildPatch(parsed: ParsedResume): UpdateCandidateRequest {
  const patch: UpdateCandidateRequest = {};
  if (parsed.fullName) patch.fullName = parsed.fullName;
  if (parsed.email) patch.email = parsed.email;
  if (parsed.phone) patch.phone = parsed.phone;
  if (parsed.currentTitle) patch.currentTitle = parsed.currentTitle;
  if (typeof parsed.totalYearsExp === 'number') patch.totalYearsExp = parsed.totalYearsExp;
  if (parsed.skills?.length) patch.skills = parsed.skills;
  if (parsed.links && (parsed.links.linkedin || parsed.links.github || parsed.links.portfolio)) {
    patch.links = parsed.links;
  }
  return patch;
}

export function CvUploader({ candidateId }: CvUploaderProps) {
  const { t, i18n } = useTranslation('recruitment');
  const { can } = usePermission();
  const canUpdate = can('recruitment:candidate_update');
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data: attachments, isLoading } = useCandidateAttachments(candidateId);
  const uploadMutation = useUploadCv(candidateId);
  const reparseMutation = useReparseCv(candidateId);
  const updateCandidate = useUpdateCandidate(candidateId);

  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  async function handleFile(file: File) {
    try {
      const created = await uploadMutation.mutateAsync(file);
      if (created.hasText) {
        toast.success(t('candidate.documents.toast.uploaded'));
      } else {
        // Image-scanned CVs upload fine but no text could be read.
        toast.success(t('candidate.documents.toast.uploadedNoText'));
      }
    } catch (err) {
      const apiErr = err as AxiosError<ApiError>;
      const code = apiErr.response?.data?.error?.code;
      if (code === 'CV_UNSUPPORTED_TYPE') {
        toast.error(t('candidate.documents.toast.unsupported'));
      } else if (code === 'CV_FILE_TOO_LARGE') {
        toast.error(t('candidate.documents.toast.tooLarge'));
      } else {
        toast.error(t('candidate.documents.toast.error'));
      }
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so re-selecting the same file fires change again.
    e.target.value = '';
  }

  async function onDownload(attachment: CandidateAttachmentDto) {
    setDownloadingId(attachment.id);
    try {
      await downloadAttachment(candidateId, attachment);
    } catch {
      toast.error(t('candidate.documents.toast.downloadError'));
    } finally {
      setDownloadingId(null);
    }
  }

  async function onReparse(attachmentId: string) {
    setReparsingId(attachmentId);
    try {
      await reparseMutation.mutateAsync(attachmentId);
      toast.success(t('candidate.documents.toast.reparseStarted'));
    } catch {
      toast.error(t('candidate.documents.toast.reparseError'));
    } finally {
      setReparsingId(null);
    }
  }

  async function onApplySuggestion(attachmentId: string, parsed: ParsedResume) {
    setApplyingId(attachmentId);
    try {
      await updateCandidate.mutateAsync(buildPatch(parsed));
      toast.success(t('candidate.documents.suggest.applied'));
    } catch {
      toast.error(t('candidate.documents.suggest.applyError'));
    } finally {
      setApplyingId(null);
    }
  }

  function renderSuggestion(a: CandidateAttachmentDto) {
    if (a.parseStatus !== 'DONE' || !a.parsed) return null;
    const p = a.parsed;
    const rows: Array<{ key: string; label: string; value: string }> = [];
    if (p.fullName) rows.push({ key: 'fullName', label: t('candidate.documents.suggest.fields.fullName'), value: p.fullName });
    if (p.email) rows.push({ key: 'email', label: t('candidate.documents.suggest.fields.email'), value: p.email });
    if (p.phone) rows.push({ key: 'phone', label: t('candidate.documents.suggest.fields.phone'), value: p.phone });
    if (p.currentTitle)
      rows.push({ key: 'currentTitle', label: t('candidate.documents.suggest.fields.currentTitle'), value: p.currentTitle });
    if (typeof p.totalYearsExp === 'number')
      rows.push({ key: 'totalYearsExp', label: t('candidate.documents.suggest.fields.totalYearsExp'), value: String(p.totalYearsExp) });
    if (p.skills?.length)
      rows.push({ key: 'skills', label: t('candidate.documents.suggest.fields.skills'), value: p.skills.join(', ') });
    if (p.links?.linkedin)
      rows.push({ key: 'linkedin', label: t('candidate.documents.suggest.fields.linkedin'), value: p.links.linkedin });
    if (p.links?.github)
      rows.push({ key: 'github', label: t('candidate.documents.suggest.fields.github'), value: p.links.github });
    if (p.links?.portfolio)
      rows.push({ key: 'portfolio', label: t('candidate.documents.suggest.fields.portfolio'), value: p.links.portfolio });

    return (
      <div className="mt-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-150">
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary">
              {t('candidate.documents.suggest.title')}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {t('candidate.documents.suggest.subtitle')}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-text-muted mt-2.5 pl-6">
            {t('candidate.documents.suggest.empty')}
          </p>
        ) : (
          <>
            <dl className="mt-2.5 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {rows.map((r) => (
                <div key={r.key} className="min-w-0">
                  <dt className="text-[11px] text-text-muted">{r.label}</dt>
                  <dd className="text-xs text-text-primary truncate" title={r.value}>
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
            {canUpdate && (
              <div className="mt-3 pl-6">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => onApplySuggestion(a.id, p)}
                  disabled={applyingId === a.id}
                >
                  {applyingId === a.id ? (
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                  ) : (
                    <Check size={13} className="mr-1.5" />
                  )}
                  {t('candidate.documents.suggest.apply')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {t('candidate.documents.title')}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">{t('candidate.documents.subtitle')}</p>
        </div>
        {canUpdate && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onInputChange}
            />
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1.5" />
              )}
              {t('candidate.documents.upload')}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !attachments || attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <FileText size={22} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-text-primary">
            {t('candidate.documents.empty.title')}
          </p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            {t('candidate.documents.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{a.fileName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                    <span className="text-xs text-text-muted tabular-nums">
                      {fmtDate(a.createdAt)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] gap-1 ${PARSE_STATUS_CLASS[a.parseStatus]}`}
                    >
                      {a.parseStatus === 'PROCESSING' && (
                        <Loader2 size={10} className="animate-spin" />
                      )}
                      {t(`candidate.documents.parseStatus.${a.parseStatus}`)}
                    </Badge>
                    {!a.hasText && (
                      <Badge
                        variant="outline"
                        className="text-[11px] gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        <AlertCircle size={11} />
                        {t('candidate.documents.noText')}
                      </Badge>
                    )}
                  </div>
                </div>
                {canUpdate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={t('candidate.documents.reparse')}
                    title={t('candidate.documents.reparse')}
                    onClick={() => onReparse(a.id)}
                    disabled={reparsingId === a.id || a.parseStatus === 'PROCESSING'}
                  >
                    {reparsingId === a.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={t('candidate.documents.download')}
                  title={t('candidate.documents.download')}
                  onClick={() => onDownload(a)}
                  disabled={downloadingId === a.id}
                >
                  {downloadingId === a.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                </Button>
              </div>
              {renderSuggestion(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
