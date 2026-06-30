import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import type { SalesStageType } from '@hrm/shared';
import { SalesStageType as StageTypeEnum } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePipelines } from '../hooks/useDeals';
import {
  useCreateStage,
  useDeleteStage,
  useReorderStages,
  isStageInUse,
} from '../hooks/usePipelineConfig';
import { EmailTemplatesSection } from '../components/EmailTemplatesSection';

export function SalesSettingsPage() {
  const { t } = useTranslation('sales');
  const { data: pipelines, isLoading } = usePipelines();
  const pipeline = pipelines?.[0];
  const pipelineId = pipeline?.id ?? '';

  const createMut = useCreateStage(pipelineId);
  const deleteMut = useDeleteStage(pipelineId);
  const reorderMut = useReorderStages(pipelineId);

  const [name, setName] = useState('');
  const [type, setType] = useState<SalesStageType>('QUALIFYING');
  const [probability, setProbability] = useState('0');

  async function addStage() {
    if (!name.trim()) return;
    try {
      await createMut.mutateAsync({ name: name.trim(), type, probability: Number(probability) || 0 });
      toast.success(t('stageConfig.toastSaved'));
      setName('');
      setProbability('0');
    } catch {
      toast.error(t('stageConfig.toastError'));
    }
  }

  async function removeStage(stageId: string) {
    try {
      await deleteMut.mutateAsync(stageId);
      toast.success(t('stageConfig.toastDeleted'));
    } catch (err) {
      toast.error(isStageInUse(err) ? t('stageConfig.inUse') : t('stageConfig.toastError'));
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!pipeline) return;
    const ids = pipeline.stages.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await reorderMut.mutateAsync(ids);
    } catch {
      toast.error(t('stageConfig.toastError'));
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('stageConfig.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{pipeline?.name}</p>
      </div>

      {isLoading || !pipeline ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          {pipeline.stages.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0 || reorderMut.isPending} className="text-text-muted hover:text-text-primary disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === pipeline.stages.length - 1 || reorderMut.isPending} className="text-text-muted hover:text-text-primary disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
              </div>
              <span className="flex-1 text-sm font-medium text-text-primary">{s.name}</span>
              <span className="text-xs text-text-muted">{s.type}</span>
              <span className="text-xs text-text-secondary tabular-nums w-12 text-right">{s.probability}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => removeStage(s.id)} disabled={deleteMut.isPending}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}

          <div className="flex items-end gap-2 px-4 py-3 bg-surface-alt/30">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t('stageConfig.name')}</Label>
              <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="w-36 space-y-1">
              <Label className="text-xs">{t('stageConfig.type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as SalesStageType)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(StageTypeEnum).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">{t('stageConfig.probability')}</Label>
              <Input className="h-8" type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} />
            </div>
            <Button size="sm" onClick={addStage} disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </Button>
          </div>
        </div>
      )}

      <EmailTemplatesSection />
    </div>
  );
}
