import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, ClipboardCheck } from 'lucide-react';
import type { KpiScorecardHistoryPoint } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useMyKpiHistory, useSelfAssess } from '../hooks/useKpiConfig';
import { EmployeeKpiDashboard } from '../components/EmployeeKpiDashboard';
import { SurveyResponses } from '../components/SurveyResponses';

export function MyKpiPage() {
  const { t } = useTranslation('kpi');
  const { data, isLoading } = useMyKpiHistory();

  // Kỳ đang ở giai đoạn tự đánh giá (cycle SELF_ASSESSMENT) → hiện thẻ tự đánh giá.
  const pending = data?.points.find((p) => p.status === 'SELF_ASSESSMENT');

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gauge size={22} className="text-primary" />{t('me.title')}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t('me.subtitle')}</p>
      </div>
      {pending && <SelfAssessCard point={pending} />}
      <SurveyResponses />
      <EmployeeKpiDashboard history={data} isLoading={isLoading} />
    </div>
  );
}

function SelfAssessCard({ point }: { point: KpiScorecardHistoryPoint }) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const selfAssess = useSelfAssess();
  const [comment, setComment] = useState(point.selfComment ?? '');
  useEffect(() => { setComment(point.selfComment ?? ''); }, [point.scorecardId, point.selfComment]);
  const done = point.scorecardStatus === 'SELF_ASSESSED';

  return (
    <div className="bg-primary-light/40 rounded-lg border border-primary/30 p-5 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-primary-dark">
        <ClipboardCheck size={16} />{t('selfAssess.title')} · {point.period}
      </h2>
      <p className="text-sm text-text-secondary">{t('selfAssess.hint')}</p>
      <div className="space-y-1.5">
        <Label>{t('selfAssess.comment')}</Label>
        <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('selfAssess.placeholder')} />
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={selfAssess.isPending || !comment.trim()}
          onClick={() => selfAssess.mutate({ scorecardId: point.scorecardId, selfComment: comment.trim() }, {
            onSuccess: () => toast.success(t('selfAssess.submitted')), onError: () => toast.error(tc('states.error')),
          })}>
          {done ? t('selfAssess.update') : t('selfAssess.submit')}
        </Button>
        {done && <span className="text-xs text-success">{t('selfAssess.doneBadge')}</span>}
      </div>
    </div>
  );
}
