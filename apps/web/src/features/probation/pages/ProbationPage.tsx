import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { ProbationCriteriaSettings } from '../components/ProbationCriteriaSettings';
import { ProbationReviewList } from '../components/ProbationReviewList';
import { ProbationGuidelines } from '../components/ProbationGuidelines';

type Tab = 'reviews' | 'criteria' | 'guidelines';

export function ProbationPage() {
  const { t } = useTranslation('probation');
  const { can } = usePermission();
  const canConfigure = can('probation:configure');

  const [tab, setTab] = useState<Tab>('reviews');

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'reviews', label: t('tabs.reviews'), show: true },
    { key: 'criteria', label: t('tabs.criteria'), show: canConfigure },
    // SPEC-032: hướng dẫn đánh giá — mọi probation:view đều đọc được (route đã guard).
    { key: 'guidelines', label: t('tabs.guidelines'), show: true },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {tabs
          .filter((tb) => tb.show)
          .map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'px-4 h-9 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === tb.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              )}
            >
              {tb.label}
            </button>
          ))}
      </div>

      {tab === 'reviews' && <ProbationReviewList />}
      {tab === 'criteria' && <ProbationCriteriaSettings />}
      {tab === 'guidelines' && <ProbationGuidelines />}
    </div>
  );
}
