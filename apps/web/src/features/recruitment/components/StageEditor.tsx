import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GitBranch, Pencil, Plus, Trash2 } from 'lucide-react';
import type { JobDto, JobStageInput, StageType } from '@hrm/shared';
import { StageType as StageTypeEnum } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useReorderJobStages } from '../hooks/useJobs';

const STAGE_TYPES = Object.values(StageTypeEnum);
const TERMINAL_TYPES: StageType[] = [StageTypeEnum.HIRED, StageTypeEnum.REJECTED];

interface DraftStage {
  key: string;
  id?: string;
  name: string;
  type: StageType;
}

function toDraft(job: JobDto): DraftStage[] {
  return [...job.stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ key: s.id, id: s.id, name: s.name, type: s.type }));
}

export function StageEditor({ job, canEdit }: { job: JobDto; canEdit: boolean }) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const reorderMutation = useReorderJobStages(job.id);

  const [editing, setEditing] = useState(false);
  const [stages, setStages] = useState<DraftStage[]>(() => toDraft(job));
  const [error, setError] = useState<string | null>(null);

  const sortedView = useMemo(
    () => [...job.stages].sort((a, b) => a.order - b.order),
    [job.stages]
  );

  function startEdit() {
    setStages(toDraft(job));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...stages];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
  }

  function rename(index: number, name: string) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, name } : s)));
  }

  function changeType(index: number, type: StageType) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, type } : s)));
  }

  function addStage() {
    setStages((prev) => {
      // Insert new stage before the first terminal stage so HIRED/REJECTED stay last.
      const firstTerminal = prev.findIndex((s) => TERMINAL_TYPES.includes(s.type));
      const draft: DraftStage = {
        key: crypto.randomUUID(),
        name: '',
        type: StageTypeEnum.SCREEN,
      };
      if (firstTerminal === -1) return [...prev, draft];
      return [...prev.slice(0, firstTerminal), draft, ...prev.slice(firstTerminal)];
    });
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (stages.length < 2) return t('job.stageEditor.validation.minStages');
    if (stages.some((s) => !s.name.trim())) return t('job.stageEditor.validation.stageNameRequired');
    if (!stages.some((s) => s.type === StageTypeEnum.HIRED))
      return t('job.stageEditor.validation.needHired');
    if (!stages.some((s) => s.type === StageTypeEnum.REJECTED))
      return t('job.stageEditor.validation.needRejected');
    return null;
  }

  function save() {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError(null);

    const payload: JobStageInput[] = stages.map((s, i) => ({
      ...(s.id ? { id: s.id } : {}),
      name: s.name.trim(),
      order: i,
      type: s.type,
    }));

    reorderMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(t('job.stageEditor.saved'));
        setEditing(false);
      },
      onError: (err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.error(
          status === 409 ? t('job.stageEditor.errorHasApplications') : t('job.stageEditor.error')
        );
      },
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-text-primary">
            <GitBranch size={16} className="text-text-muted" />
            {t('job.stageEditor.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1 max-w-md">{t('job.stageEditor.subtitle')}</p>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={startEdit}>
            <Pencil size={13} className="mr-1.5" />
            {t('job.stageEditor.edit')}
          </Button>
        )}
      </div>

      <div className="p-4">
        {!editing ? (
          <ol className="space-y-2">
            {sortedView.map((stage, i) => (
              <li
                key={stage.id}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-medium text-text-secondary tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-text-primary truncate">{stage.name}</span>
                <span className="text-xs text-text-muted">
                  {t(`pipeline.stageType.${stage.type}`)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {stages.map((stage, index) => {
                const isTerminal = TERMINAL_TYPES.includes(stage.type);
                return (
                  <div
                    key={stage.key}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-2"
                  >
                    <div className="flex flex-col pt-1">
                      <button
                        type="button"
                        aria-label={t('job.stageEditor.moveUp')}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('job.stageEditor.moveDown')}
                        disabled={index === stages.length - 1}
                        onClick={() => move(index, 1)}
                        className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={stage.name}
                        placeholder={t('pipeline.form.stageNamePlaceholder')}
                        className="h-8 text-xs"
                        onChange={(e) => rename(index, e.target.value)}
                      />
                      <Select
                        value={stage.type}
                        onValueChange={(v) => changeType(index, v as StageType)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`pipeline.stageType.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <button
                      type="button"
                      aria-label={t('job.stageEditor.remove')}
                      disabled={isTerminal}
                      title={isTerminal ? t('job.stageEditor.terminalHint') : undefined}
                      onClick={() => removeStage(index)}
                      className={cn(
                        'mt-1 text-text-muted hover:text-danger transition-colors disabled:opacity-30'
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={addStage}
            >
              <Plus size={13} />
              {t('job.stageEditor.addStage')}
            </Button>

            {error && <p className="text-xs text-danger">{error}</p>}
            <p className="text-xs text-text-muted">{t('job.stageEditor.terminalHint')}</p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                {t('job.stageEditor.cancel')}
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={reorderMutation.isPending}>
                {reorderMutation.isPending ? tc('states.saving') : t('job.stageEditor.save')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
