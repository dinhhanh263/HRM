import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { ProbationReviewStatus } from '@hrm/shared';
import { cn } from '@/lib/utils';

interface ProbationStepIndicatorProps {
  status: ProbationReviewStatus;
  selfSubmittedAt: string | null;
}

/**
 * Flow 3 bước của công ty (SPEC-033): 1 Tự đánh giá → 2 Quản lý → 3 Quyết định.
 * Step 1 done khi NV đã nộp self; step 2 done khi review rời DRAFT; step 3 done
 * khi DECIDED. Bước "đang tới" được tô primary.
 */
export function ProbationStepIndicator({ status, selfSubmittedAt }: ProbationStepIndicatorProps) {
  const { t } = useTranslation('probation');

  const steps = [
    { key: 'self', done: !!selfSubmittedAt },
    { key: 'manager', done: status === 'PENDING_HR' || status === 'DECIDED' },
    { key: 'final', done: status === 'DECIDED' },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <ol className="flex items-center gap-2" aria-label={t('steps.ariaLabel')}>
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-5 bg-border" />}
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              step.done
                ? 'text-primary'
                : i === activeIndex
                  ? 'text-text-primary'
                  : 'text-text-muted'
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                step.done
                  ? 'bg-primary text-primary-foreground'
                  : i === activeIndex
                    ? 'border border-primary text-primary'
                    : 'border border-border text-text-muted'
              )}
            >
              {step.done ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            {t(`steps.${step.key}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
