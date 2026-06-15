import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import type {
  ProbationCriteriaDto,
  ProbationCompetencyGroup,
  ProbationRatings,
} from '@hrm/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const RATING_SCALE = [1, 2, 3, 4, 5];

interface CriteriaRatingBoardProps {
  criteria: ProbationCriteriaDto[];
  ratings: ProbationRatings;
  editable: boolean;
  onRate: (criteriaId: string, score: number) => void;
  // SPEC-033: điểm tự chấm của NV hiển thị dạng badge phụ cạnh từng tiêu chí
  // (scorecard của manager/HR). Null/undefined = không hiển thị.
  selfRatings?: ProbationRatings | null;
}

function average(items: ProbationCriteriaDto[], ratings: ProbationRatings): string | null {
  const scored = items.map((c) => ratings[c.id]).filter((n) => typeof n === 'number' && n >= 1);
  if (scored.length === 0) return null;
  return (scored.reduce((sum, n) => sum + n, 0) / scored.length).toFixed(1);
}

/**
 * Bảng chấm 1–5 theo nhóm What/How (SPEC-031): sub-score trung bình từng nhóm +
 * popover rubric tô đậm mức đang chọn. Dùng chung cho scorecard manager/HR và
 * trang tự đánh giá của nhân viên (SPEC-033).
 */
export function CriteriaRatingBoard({
  criteria,
  ratings,
  editable,
  onRate,
  selfRatings,
}: CriteriaRatingBoardProps) {
  const { t } = useTranslation('probation');

  const grouped = useMemo(() => {
    const order: ProbationCompetencyGroup[] = ['PERFORMANCE', 'VALUES'];
    return order
      .map((key) => ({ key, items: criteria.filter((c) => c.group === key) }))
      .filter((g) => g.items.length > 0);
  }, [criteria]);

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.key} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t(`scorecard.groups.${group.key}`)}
            </span>
            <span className="text-xs text-text-secondary">
              {selfRatings && (
                <span className="mr-3">
                  {t('scorecard.selfSubScore')}{' '}
                  <span className="font-semibold text-text-primary tabular-nums">
                    {average(group.items, selfRatings) ?? '—'}
                  </span>
                </span>
              )}
              {t('scorecard.subScore')}{' '}
              <span className="font-semibold text-text-primary tabular-nums">
                {average(group.items, ratings) ?? '—'}
              </span>
            </span>
          </div>
          {group.items.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm text-text-primary">{c.name}</span>
                {c.rubric && c.rubric.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('scorecard.rubricGuide', { name: c.name })}
                        className="shrink-0 rounded-sm text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <HelpCircle size={14} strokeWidth={1.5} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-3">
                      <p className="mb-2 text-sm font-semibold">{c.name}</p>
                      <ul className="space-y-1.5">
                        {c.rubric.map((lvl) => (
                          <li
                            key={lvl.score}
                            className={cn(
                              'rounded-md p-2 text-xs transition-colors',
                              ratings[c.id] === lvl.score
                                ? 'bg-primary/10 text-text-primary'
                                : 'text-text-secondary'
                            )}
                          >
                            <p className="font-semibold">
                              <span className="tabular-nums">{lvl.score}</span> — {lvl.level}
                            </p>
                            {lvl.definition && <p className="mt-0.5">{lvl.definition}</p>}
                            {lvl.observable && <p className="mt-0.5 italic">{lvl.observable}</p>}
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
                {selfRatings && typeof selfRatings[c.id] === 'number' && (
                  <span className="shrink-0 rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary tabular-nums">
                    {t('scorecard.selfBadge', { score: selfRatings[c.id] })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={c.name}>
                {RATING_SCALE.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={ratings[c.id] === n}
                    disabled={!editable}
                    onClick={() => onRate(c.id, n)}
                    className={cn(
                      'size-8 rounded-md text-sm font-medium tabular-nums transition-colors',
                      'disabled:opacity-60 disabled:cursor-not-allowed',
                      ratings[c.id] === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-alt text-text-secondary hover:bg-border'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
