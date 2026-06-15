import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import type { ProbationRatings } from '@hrm/shared';
import { getApiErrorCode } from '@/lib/api-error';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { CriteriaRatingBoard } from '../components/CriteriaRatingBoard';
import { ProbationStepIndicator } from '../components/ProbationStepIndicator';
import {
  useMyProbationReview,
  usePatchProbationSelf,
  useSubmitProbationSelf,
} from '../hooks/useProbation';

export function ProbationSelfPage() {
  const { t } = useTranslation('probation');
  const { data: review, isLoading } = useMyProbationReview();

  const patchMutation = usePatchProbationSelf(review?.id ?? '');
  const submitMutation = useSubmitProbationSelf(review?.id ?? '');

  const [ratings, setRatings] = useState<ProbationRatings>({});
  const [comment, setComment] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!review) return;
    setRatings(review.selfRatings ?? {});
    setComment(review.selfComment ?? '');
  }, [review]);

  // Chỉ sửa được khi review còn DRAFT và bản thân chưa nộp (mirror rule BE).
  const editable = review?.status === 'DRAFT' && !review.selfSubmittedAt;
  const criteria = review?.criteria ?? [];
  const allScored = useMemo(
    () => criteria.length > 0 && criteria.every((c) => ratings[c.id] >= 1),
    [criteria, ratings]
  );

  function handleSaveDraft() {
    patchMutation.mutate(
      { selfRatings: ratings, selfComment: comment || null },
      {
        onSuccess: () => toast.success(t('self.toast.draftSaved')),
        onError: () => toast.error(t('self.toast.saveError')),
      }
    );
  }

  function performSubmit() {
    submitMutation.mutate(
      { selfRatings: ratings, selfComment: comment || null },
      {
        onSuccess: () => {
          toast.success(t('self.toast.submitted'));
          setConfirmOpen(false);
        },
        onError: (error) => {
          const code = getApiErrorCode(error);
          const description =
            code === 'PROBATION_SELF_INCOMPLETE'
              ? t('self.toast.incomplete')
              : code === 'PROBATION_SELF_NOT_EDITABLE'
                ? t('self.toast.notEditable')
                : t('toast.tryAgain');
          toast.error(t('self.toast.submitError'), { description });
          setConfirmOpen(false);
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('self.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('self.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : !review ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
            <ClipboardCheck size={24} className="text-text-muted" />
          </div>
          <h3 className="font-semibold text-text-primary mb-1">{t('self.empty.title')}</h3>
          <p className="text-sm text-text-muted max-w-xs">{t('self.empty.description')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <ProbationStepIndicator
            status={review.status}
            selfSubmittedAt={review.selfSubmittedAt}
          />

          {review.selfSubmittedAt ? (
            <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm text-text-secondary">
              {t('self.submittedNotice')}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">{t('self.instruction')}</p>
          )}

          <CriteriaRatingBoard
            criteria={criteria}
            ratings={ratings}
            editable={!!editable}
            onRate={(criteriaId, score) =>
              setRatings((prev) => ({ ...prev, [criteriaId]: score }))
            }
          />

          <div className="space-y-1.5">
            <Label htmlFor="self-comment" className="text-sm font-medium">
              {t('self.comment')}
            </Label>
            <Textarea
              id="self-comment"
              value={comment}
              disabled={!editable}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('self.commentPlaceholder')}
              maxLength={2000}
              rows={3}
            />
          </div>

          {editable && (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={patchMutation.isPending}
              >
                {patchMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('self.saveDraft')}
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!allScored || submitMutation.isPending}
              >
                {t('self.submit')}
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('self.confirmDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('self.confirmDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction onClick={performSubmit} disabled={submitMutation.isPending}>
              {t('self.confirmDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
