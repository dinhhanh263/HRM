import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import type { CreateKpiSurveyInput, KpiSurveyDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useKpiSurveys, useKpiSurveyMutations, useKpiFrameworks } from '../hooks/useKpiConfig';

export function KpiSurveysPage() {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: surveys, isLoading } = useKpiSurveys();
  const m = useKpiSurveyMutations();
  const [createOpen, setCreateOpen] = useState(false);
  const fail = () => toast.error(tc('states.error'));

  return (
    <div className="p-6 space-y-6 max-w-screen-lg">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare size={22} className="text-primary" />{t('survey.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('survey.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-1.5" />{t('survey.add')}</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded" />)}</div>
      ) : (surveys ?? []).length === 0 ? (
        <p className="text-sm text-text-muted">{t('survey.empty')}</p>
      ) : (
        <div className="space-y-4">
          {surveys!.map((s) => <SurveyCard key={s.id} survey={s} mut={m} />)}
        </div>
      )}

      <CreateSurveySheet open={createOpen} onOpenChange={setCreateOpen} isLoading={m.create.isPending}
        onSubmit={(body) => m.create.mutate(body, { onSuccess: () => { toast.success(t('toast.created')); setCreateOpen(false); }, onError: fail })} />
    </div>
  );
}

function SurveyCard({ survey, mut }: { survey: KpiSurveyDto; mut: ReturnType<typeof useKpiSurveyMutations> }) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [mapsTo, setMapsTo] = useState('');
  const fail = () => toast.error(tc('states.error'));

  return (
    <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{survey.title}</h2>
            <Badge variant="outline">{t(`survey.type.${survey.type}`)}</Badge>
            {!survey.active && <Badge variant="outline" className="text-text-muted">{t('survey.inactive')}</Badge>}
          </div>
          <p className="text-xs text-text-muted mt-1">
            {t('survey.minResponses')}: {survey.minResponses} · {survey.responseCount} {t('survey.responses')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => mut.update.mutate({ id: survey.id, body: { active: !survey.active } }, { onError: fail })}>
            {survey.active ? t('survey.deactivate') : t('survey.activate')}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-danger"
            onClick={() => mut.remove.mutate(survey.id, { onSuccess: () => toast.success(t('toast.deleted')), onError: fail })} aria-label={tc('actions.delete')}>
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">{t('survey.questions')}</p>
        <ul className="space-y-1.5">
          {survey.questions.map((q) => (
            <li key={q.id} className="group flex items-center gap-2 text-sm">
              <Badge variant="outline" className="shrink-0">{q.code}</Badge>
              <span className="flex-1 min-w-0 truncate">{q.text}</span>
              <span className="text-xs text-text-muted">{q.scaleMin}–{q.scaleMax}{q.mapsToKpiCode ? ` → ${q.mapsToKpiCode}` : ''}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-danger opacity-0 group-hover:opacity-100"
                onClick={() => mut.removeQuestion.mutate({ id: survey.id, questionId: q.id }, { onError: fail })} aria-label={tc('actions.delete')}>
                <Trash2 size={12} />
              </Button>
            </li>
          ))}
        </ul>
        {/* Add question inline */}
        <div className="flex items-end gap-2 mt-3">
          <div className="w-20"><Label className="text-xs">{t('survey.qCode')}</Label><Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="M1" /></div>
          <div className="flex-1"><Label className="text-xs">{t('survey.qText')}</Label><Input className="h-8" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="w-24"><Label className="text-xs">{t('survey.qMapsTo')}</Label><Input className="h-8" value={mapsTo} onChange={(e) => setMapsTo(e.target.value)} placeholder="T1" /></div>
          <Button size="sm" className="h-8" disabled={!code.trim() || !text.trim()}
            onClick={() => mut.addQuestion.mutate({ id: survey.id, body: { code: code.trim(), text: text.trim(), mapsToKpiCode: mapsTo.trim() || null } }, {
              onSuccess: () => { setCode(''); setText(''); setMapsTo(''); }, onError: fail })}>
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateSurveySheet({ open, onOpenChange, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (b: CreateKpiSurveyInput) => void; isLoading?: boolean;
}) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: frameworks } = useKpiFrameworks();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CreateKpiSurveyInput['type']>('MONTHLY_MORALE');
  const [frameworkId, setFrameworkId] = useState('');
  const [minResponses, setMinResponses] = useState('3');
  useEffect(() => { if (open) { setTitle(''); setType('MONTHLY_MORALE'); setFrameworkId(''); setMinResponses('3'); } }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{t('survey.createTitle')}</SheetTitle></SheetHeader>
        <div className="mt-6 flex-1 space-y-4">
          <div className="space-y-1.5"><Label>{t('survey.titleField')} <span className="text-danger">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('survey.typeField')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as CreateKpiSurveyInput['type'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY_MORALE">{t('survey.type.MONTHLY_MORALE')}</SelectItem>
                <SelectItem value="QUARTERLY_PEER_360">{t('survey.type.QUARTERLY_PEER_360')}</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>{t('survey.framework')}</Label>
            <Select value={frameworkId} onValueChange={setFrameworkId}>
              <SelectTrigger><SelectValue placeholder={t('cycle.selectFramework')} /></SelectTrigger>
              <SelectContent>{(frameworks ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>{t('survey.minResponses')}</Label>
            <Input type="number" min={1} value={minResponses} onChange={(e) => setMinResponses(e.target.value)} className="tabular-nums" /></div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button disabled={!title.trim() || isLoading}
            onClick={() => onSubmit({ title: title.trim(), type, frameworkId: frameworkId || null, minResponses: Number(minResponses) || 3 })}>
            {tc('actions.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
