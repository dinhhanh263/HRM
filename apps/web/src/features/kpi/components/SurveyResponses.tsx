import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Check } from 'lucide-react';
import type { KpiSurveyDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useActiveSurveys, useRespondSurvey } from '../hooks/useKpiConfig';

/** Danh sách survey ẩn danh đang mở để nhân viên trả lời (trên /kpi/me). */
export function SurveyResponses() {
  const { t } = useTranslation('kpi');
  const { data: surveys } = useActiveSurveys();
  const active = (surveys ?? []).filter((s) => s.questions.length > 0);
  if (active.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <MessageSquare size={16} className="text-primary" />{t('respond.title')}
      </h2>
      {active.map((s) => <SurveyForm key={s.id} survey={s} />)}
    </div>
  );
}

function SurveyForm({ survey }: { survey: KpiSurveyDto }) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const respond = useRespondSurvey();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const allAnswered = survey.questions.every((q) => answers[q.code]?.trim());

  function submit() {
    const payload: Record<string, number> = {};
    for (const q of survey.questions) payload[q.code] = Number(answers[q.code]);
    respond.mutate({ id: survey.id, body: { cycleId: survey.openCycleId, answers: payload } }, {
      onSuccess: () => { setDone(true); toast.success(t('respond.submitted')); },
      onError: () => toast.error(tc('states.error')),
    });
  }

  if (done) {
    return (
      <div className="bg-success-light/40 rounded-lg border border-success/30 p-4 flex items-center gap-2 text-sm text-success">
        <Check size={16} />{t('respond.thanks', { title: survey.title })}
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <p className="text-sm font-medium">{survey.title} <span className="text-xs text-text-muted">· {t('respond.anonymous')}</span></p>
      {survey.questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <Label className="text-sm">{q.code}. {q.text}</Label>
          <Select value={answers[q.code] ?? ''} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.code]: v }))}>
            <SelectTrigger className="h-8 w-28"><SelectValue placeholder={`${q.scaleMin}–${q.scaleMax}`} /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: q.scaleMax - q.scaleMin + 1 }, (_, i) => q.scaleMin + i).map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <Button size="sm" disabled={!allAnswered || respond.isPending} onClick={submit}>{t('respond.submit')}</Button>
    </div>
  );
}
