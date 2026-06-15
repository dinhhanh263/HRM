import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import type {
  ProbationReviewDto,
  ProbationOutcome,
  ProbationRatings,
  ProbationDeliverable,
  ProbationDeliverableOutcome,
} from '@hrm/shared';
import { getApiErrorCode } from '@/lib/api-error';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { CriteriaRatingBoard } from './CriteriaRatingBoard';
import { ProbationStepIndicator } from './ProbationStepIndicator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePermission } from '@/hooks/usePermission';
import {
  useProbationCriteria,
  usePatchProbationReview,
  useSubmitProbationReview,
  useDecideProbationReview,
  useCancelProbationReview,
} from '../hooks/useProbation';

const OUTCOMES: ProbationOutcome[] = ['CONFIRM', 'EXTEND', 'FAIL'];
const DELIVERABLE_OUTCOMES: ProbationDeliverableOutcome[] = ['MET', 'EXCEEDED', 'NOT_MET'];
const MAX_DELIVERABLES = 50;

// Hàng deliverable đang soạn trong form ('' = chưa nhập, chuẩn hóa thành null khi gửi).
interface DeliverableRow {
  title: string;
  link: string;
  outcome: ProbationDeliverableOutcome | '';
  note: string;
}

function toDeliverableRows(items: ProbationDeliverable[] | null): DeliverableRow[] {
  return (items ?? []).map((d) => ({
    title: d.title,
    link: d.link ?? '',
    outcome: d.outcome ?? '',
    note: d.note ?? '',
  }));
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ProbationScorecardSheetProps {
  review: ProbationReviewDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProbationScorecardSheet({
  review,
  open,
  onOpenChange,
}: ProbationScorecardSheetProps) {
  const { t } = useTranslation('probation');
  const { can } = usePermission();
  const { data: criteria, isLoading } = useProbationCriteria(true);
  const patchMutation = usePatchProbationReview(review?.id ?? '');
  const submitMutation = useSubmitProbationReview(review?.id ?? '');
  const decideMutation = useDecideProbationReview(review?.id ?? '');
  const cancelMutation = useCancelProbationReview(review?.id ?? '');

  // Only a DRAFT is editable by the manager (immutable once submitted).
  const editable = review?.status === 'DRAFT';
  // HR decides a submitted review; any open review can be withdrawn.
  const canDecide = review?.status === 'PENDING_HR' && can('probation:decide');
  const cancellable =
    (review?.status === 'DRAFT' || review?.status === 'PENDING_HR') && can('probation:review');

  const [ratings, setRatings] = useState<ProbationRatings>({});
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [comment, setComment] = useState('');
  const [recommendation, setRecommendation] = useState<ProbationOutcome | ''>('');
  const [newDate, setNewDate] = useState('');

  const [decision, setDecision] = useState<ProbationOutcome | ''>('');
  const [decisionNote, setDecisionNote] = useState('');
  const [decideDate, setDecideDate] = useState('');
  const [failOpen, setFailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Reset local form whenever a different review is opened.
  useEffect(() => {
    if (!review) return;
    setRatings(review.ratings ?? {});
    setDeliverables(toDeliverableRows(review.deliverables));
    setStrengths(review.strengths ?? '');
    setWeaknesses(review.weaknesses ?? '');
    setComment(review.comment ?? '');
    setRecommendation(review.recommendation ?? '');
    setNewDate(review.newProbationEndDate ? review.newProbationEndDate.slice(0, 10) : '');
    // HR's decision starts from the manager's recommendation as a sensible default.
    setDecision(review.recommendation ?? '');
    setDecisionNote('');
    setDecideDate(review.newProbationEndDate ? review.newProbationEndDate.slice(0, 10) : '');
  }, [review]);

  const activeCriteria = criteria ?? [];
  const allScored = useMemo(
    () => activeCriteria.length > 0 && activeCriteria.every((c) => ratings[c.id] >= 1),
    [activeCriteria, ratings]
  );
  const canSubmit =
    allScored &&
    !!recommendation &&
    (recommendation !== 'EXTEND' || !!newDate) &&
    !submitMutation.isPending;

  if (!review) return null;

  // Chuẩn hóa các hàng deliverable thành payload; trả null + toast nếu có hàng không hợp lệ.
  function normalizeDeliverables(): ProbationDeliverable[] | null {
    const rows = deliverables.filter(
      (d) => d.title.trim() || d.link.trim() || d.note.trim() || d.outcome
    );
    for (const row of rows) {
      if (!row.title.trim()) {
        toast.error(t('scorecard.deliverables.toast.titleRequired'));
        return null;
      }
      if (row.link.trim() && !isValidUrl(row.link.trim())) {
        toast.error(t('scorecard.deliverables.toast.invalidLink'));
        return null;
      }
    }
    return rows.map((d) => ({
      title: d.title.trim(),
      link: d.link.trim() || null,
      outcome: d.outcome || null,
      note: d.note.trim() || null,
    }));
  }

  function handleSaveDraft() {
    const normalized = normalizeDeliverables();
    if (!normalized) return;
    patchMutation.mutate(
      {
        ratings,
        deliverables: normalized,
        strengths: strengths || null,
        weaknesses: weaknesses || null,
        comment: comment || null,
        recommendation: recommendation || null,
        newProbationEndDate: recommendation === 'EXTEND' && newDate ? newDate : null,
      },
      {
        onSuccess: () => toast.success(t('scorecard.toast.draftSaved')),
        onError: () => toast.error(t('scorecard.toast.saveError')),
      }
    );
  }

  function handleSubmit() {
    if (!recommendation) return;
    const normalized = normalizeDeliverables();
    if (!normalized) return;
    submitMutation.mutate(
      {
        ratings,
        recommendation,
        deliverables: normalized,
        strengths: strengths || null,
        weaknesses: weaknesses || null,
        comment: comment || null,
        newProbationEndDate: recommendation === 'EXTEND' && newDate ? newDate : null,
      },
      {
        onSuccess: () => {
          toast.success(t('scorecard.toast.submitted'));
          onOpenChange(false);
        },
        onError: (error) => {
          const code = getApiErrorCode(error);
          const description =
            code === 'PROBATION_INCOMPLETE_SCORECARD'
              ? t('scorecard.toast.incomplete')
              : code === 'PROBATION_EXTEND_DATE_REQUIRED'
                ? t('scorecard.toast.extendDate')
                : t('toast.tryAgain');
          toast.error(t('scorecard.toast.submitError'), { description });
        },
      }
    );
  }

  const canDecideSubmit =
    !!decision &&
    (decision !== 'EXTEND' || !!decideDate) &&
    (decision !== 'FAIL' || !!decisionNote.trim()) &&
    !decideMutation.isPending;

  function performDecide() {
    if (!decision) return;
    decideMutation.mutate(
      {
        decision,
        decisionNote: decisionNote.trim() || null,
        newProbationEndDate: decision === 'EXTEND' && decideDate ? decideDate : null,
      },
      {
        onSuccess: () => {
          toast.success(t('decide.toast.decided'));
          setFailOpen(false);
          onOpenChange(false);
        },
        onError: (error) => {
          const code = getApiErrorCode(error);
          const description =
            code === 'PROBATION_FAIL_REASON_REQUIRED'
              ? t('decide.toast.failReason')
              : code === 'PROBATION_EXTEND_DATE_REQUIRED'
                ? t('decide.toast.extendDate')
                : code === 'PROBATION_REVIEW_NOT_DECIDABLE'
                  ? t('decide.toast.notDecidable')
                  : t('toast.tryAgain');
          toast.error(t('decide.toast.decideError'), { description });
        },
      }
    );
  }

  function handleDecideClick() {
    // Termination is destructive — gate FAIL behind an explicit confirmation.
    if (decision === 'FAIL') {
      setFailOpen(true);
      return;
    }
    performDecide();
  }

  function handleCancelReview() {
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('decide.toast.cancelled'));
        setCancelOpen(false);
        onOpenChange(false);
      },
      onError: (error) => {
        const code = getApiErrorCode(error);
        const description =
          code === 'PROBATION_REVIEW_NOT_CANCELLABLE'
            ? t('decide.toast.notCancellable')
            : t('toast.tryAgain');
        toast.error(t('decide.toast.cancelError'), { description });
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-5">
        <SheetHeader>
          <SheetTitle>{review.employee.fullName}</SheetTitle>
          <SheetDescription>
            {review.employee.employeeCode}
            {editable ? '' : ` · ${t(`status.${review.status}`)}`}
          </SheetDescription>
        </SheetHeader>

        {/* SPEC-033: flow 3 bước — Tự đánh giá → Quản lý → Quyết định. */}
        <ProbationStepIndicator status={review.status} selfSubmittedAt={review.selfSubmittedAt} />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : activeCriteria.length === 0 ? (
          <p className="text-sm text-text-muted py-4">{t('scorecard.noCriteria')}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* SPEC-033: banner chặn mềm — NV chưa tự đánh giá, manager vẫn chấm được. */}
            {!review.selfSubmittedAt && (
              <p className="rounded-lg bg-surface-alt px-4 py-2.5 text-xs text-text-secondary">
                {t('scorecard.selfNotSubmitted')}
              </p>
            )}

            <div className="space-y-4">
              <Label className="text-sm font-semibold">{t('scorecard.scores')}</Label>
              <CriteriaRatingBoard
                criteria={activeCriteria}
                ratings={ratings}
                editable={editable}
                onRate={(criteriaId, score) =>
                  setRatings((prev) => ({ ...prev, [criteriaId]: score }))
                }
                selfRatings={review.selfSubmittedAt ? review.selfRatings : null}
              />
            </div>

            {/* SPEC-033: nhận xét tự đánh giá của NV (chỉ có sau khi NV nộp). */}
            {review.selfSubmittedAt && review.selfComment && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('scorecard.selfComment')}</Label>
                <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">
                  {review.selfComment}
                </p>
              </div>
            )}

            {/* SPEC-031: nhật ký bằng chứng deliverable — sửa khi DRAFT, chỉ đọc sau nộp. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  {t('scorecard.deliverables.title')}
                </Label>
                {editable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={deliverables.length >= MAX_DELIVERABLES}
                    onClick={() =>
                      setDeliverables((prev) => [
                        ...prev,
                        { title: '', link: '', outcome: '', note: '' },
                      ])
                    }
                  >
                    <Plus size={12} />
                    {t('scorecard.deliverables.add')}
                  </Button>
                )}
              </div>

              {deliverables.length === 0 ? (
                <p className="text-xs text-text-muted">{t('scorecard.deliverables.empty')}</p>
              ) : editable ? (
                <div className="space-y-3">
                  {deliverables.map((d, i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={d.title}
                          placeholder={t('scorecard.deliverables.titlePlaceholder')}
                          aria-label={t('scorecard.deliverables.titlePlaceholder')}
                          className="h-8 text-sm"
                          maxLength={200}
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, title: e.target.value } : row
                              )
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-text-muted hover:text-danger"
                          aria-label={t('scorecard.deliverables.remove', { index: i + 1 })}
                          onClick={() =>
                            setDeliverables((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={d.link}
                          placeholder={t('scorecard.deliverables.linkPlaceholder')}
                          aria-label={t('scorecard.deliverables.linkPlaceholder')}
                          className="h-8 flex-1 text-sm"
                          maxLength={500}
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, link: e.target.value } : row
                              )
                            )
                          }
                        />
                        <Select
                          value={d.outcome}
                          onValueChange={(v) =>
                            setDeliverables((prev) =>
                              prev.map((row, j) =>
                                j === i
                                  ? { ...row, outcome: v as ProbationDeliverableOutcome }
                                  : row
                              )
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-36 shrink-0 text-xs"
                            aria-label={t('scorecard.deliverables.outcomePlaceholder')}
                          >
                            <SelectValue
                              placeholder={t('scorecard.deliverables.outcomePlaceholder')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {DELIVERABLE_OUTCOMES.map((o) => (
                              <SelectItem key={o} value={o}>
                                {t(`scorecard.deliverables.outcomes.${o}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        value={d.note}
                        placeholder={t('scorecard.deliverables.notePlaceholder')}
                        aria-label={t('scorecard.deliverables.notePlaceholder')}
                        className="h-8 text-sm"
                        maxLength={1000}
                        onChange={(e) =>
                          setDeliverables((prev) =>
                            prev.map((row, j) =>
                              j === i ? { ...row, note: e.target.value } : row
                            )
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="space-y-2">
                  {deliverables.map((d, i) => (
                    <li key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-text-primary">{d.title}</p>
                        {d.outcome && (
                          <span className="shrink-0 text-xs text-text-secondary">
                            {t(`scorecard.deliverables.outcomes.${d.outcome}`)}
                          </span>
                        )}
                      </div>
                      {d.link && (
                        <a
                          href={d.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                        >
                          <ExternalLink size={11} className="shrink-0" />
                          <span className="truncate">{d.link}</span>
                        </a>
                      )}
                      {d.note && <p className="mt-1 text-xs text-text-muted">{d.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('scorecard.strengths')}</Label>
              <Textarea
                value={strengths}
                disabled={!editable}
                onChange={(e) => setStrengths(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('scorecard.weaknesses')}</Label>
              <Textarea
                value={weaknesses}
                disabled={!editable}
                onChange={(e) => setWeaknesses(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('scorecard.comment')}</Label>
              <Textarea
                value={comment}
                disabled={!editable}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('scorecard.recommendation')} <span className="text-danger">*</span>
              </Label>
              <Select
                value={recommendation}
                disabled={!editable}
                onValueChange={(v) => setRecommendation(v as ProbationOutcome)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t('scorecard.recommendationPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {t(`outcome.${o}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {recommendation === 'EXTEND' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t('scorecard.newProbationEndDate')} <span className="text-danger">*</span>
                </Label>
                <Input
                  type="date"
                  value={newDate}
                  disabled={!editable}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {canDecide && (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt/50 p-4">
            <div>
              <Label className="text-sm font-semibold">{t('decide.title')}</Label>
              <p className="text-xs text-text-muted mt-0.5">{t('decide.subtitle')}</p>
            </div>

            {review.recommendation && (
              <p className="text-xs text-text-secondary">
                {t('decide.managerRecommends')}:{' '}
                <span className="font-medium text-text-primary">
                  {t(`outcome.${review.recommendation}`)}
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('decide.decision')} <span className="text-danger">*</span>
              </Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as ProbationOutcome)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t('decide.decisionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {t(`outcome.${o}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {decision === 'EXTEND' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t('decide.newDate')} <span className="text-danger">*</span>
                </Label>
                <Input
                  type="date"
                  value={decideDate}
                  onChange={(e) => setDecideDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('decide.note')}
                {decision === 'FAIL' && <span className="text-danger"> *</span>}
              </Label>
              <Textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={t('decide.notePlaceholder')}
                rows={2}
              />
            </div>
          </div>
        )}

        {editable && activeCriteria.length > 0 && (
          <SheetFooter className="mt-auto gap-2">
            {cancellable && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setCancelOpen(true)}
              >
                {t('decide.cancelReview')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={patchMutation.isPending}
            >
              {t('scorecard.saveDraft')}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {t('scorecard.submit')}
            </Button>
          </SheetFooter>
        )}

        {canDecide && (
          <SheetFooter className="mt-auto gap-2">
            {cancellable && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setCancelOpen(true)}
              >
                {t('decide.cancelReview')}
              </Button>
            )}
            <Button type="button" onClick={handleDecideClick} disabled={!canDecideSubmit}>
              {t('decide.confirm')}
            </Button>
          </SheetFooter>
        )}

        <AlertDialog open={failOpen} onOpenChange={setFailOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('decide.failWarning.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('decide.failWarning.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-danger hover:bg-danger/90"
                onClick={performDecide}
                disabled={decideMutation.isPending}
              >
                {t('decide.failWarning.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('decide.cancelDialog.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('decide.cancelDialog.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-danger hover:bg-danger/90"
                onClick={handleCancelReview}
                disabled={cancelMutation.isPending}
              >
                {t('decide.cancelDialog.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
