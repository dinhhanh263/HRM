import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Plus, GripVertical } from 'lucide-react';
import type { DealDto, SalesPipelineDto, SalesStageDto } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { usePipelines, useDeals, useMoveDeal, useWinDeal, useLoseDeal } from '../hooks/useDeals';
import { DealFormSheet } from '../components/DealFormSheet';
import { LoseDealDialog } from '../components/LoseDealDialog';
import { DealDetailSheet } from '../components/DealDetailSheet';

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('vi-VN')} ${currency}`;
  }
}

export function PipelinePage() {
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const { data: pipelines, isLoading: loadingPipelines } = usePipelines();
  const pipeline: SalesPipelineDto | undefined = pipelines?.[0];
  const { data: deals, isLoading } = useDeals({ pipelineId: pipeline?.id });

  const moveMut = useMoveDeal();
  const winMut = useWinDeal();
  const loseMut = useLoseDeal();

  const [formOpen, setFormOpen] = useState(false);
  const [loseId, setLoseId] = useState<string | null>(null);
  const [detailDeal, setDetailDeal] = useState<DealDto | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const canMove = can('sales:deal_move');

  const byStage = useMemo(() => {
    const map = new Map<string, DealDto[]>();
    (deals ?? []).forEach((d) => {
      const list = map.get(d.currentStageId) ?? [];
      list.push(d);
      map.set(d.currentStageId, list);
    });
    return map;
  }, [deals]);

  async function handleDragEnd(e: DragEndEvent) {
    const dealId = String(e.active.id);
    const toStageId = e.over ? String(e.over.id) : null;
    if (!toStageId || !pipeline) return;
    const deal = deals?.find((d) => d.id === dealId);
    const target = pipeline.stages.find((s) => s.id === toStageId);
    if (!deal || !target || deal.currentStageId === toStageId) return;

    try {
      if (target.type === 'WON') {
        await winMut.mutateAsync(dealId);
        toast.success(t('deal.toast.won'));
      } else if (target.type === 'LOST') {
        setLoseId(dealId); // ask for a reason
      } else {
        await moveMut.mutateAsync({ id: dealId, toStageId });
        toast.success(t('deal.toast.moved'));
      }
    } catch {
      toast.error(t('deal.toast.error'));
    }
  }

  async function confirmLose(reason: string) {
    if (!loseId) return;
    try {
      await loseMut.mutateAsync({ id: loseId, lostReason: reason });
      toast.success(t('deal.toast.lost'));
      setLoseId(null);
    } catch {
      toast.error(t('deal.toast.error'));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pipeline.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('pipeline.subtitle')}</p>
        </div>
        {can('sales:deal_create') && pipeline && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            {t('pipeline.newDeal')}
          </Button>
        )}
      </div>

      {loadingPipelines || isLoading ? (
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-72 rounded-lg" />)}
        </div>
      ) : pipeline ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipeline.stages.map((stage) => (
              <StageColumn key={stage.id} stage={stage} deals={byStage.get(stage.id) ?? []} canMove={canMove} formatMoney={formatMoney} onOpen={setDetailDeal} />
            ))}
          </div>
        </DndContext>
      ) : null}

      {pipeline && <DealFormSheet open={formOpen} onOpenChange={setFormOpen} pipelineId={pipeline.id} />}
      <LoseDealDialog open={loseId !== null} onOpenChange={(o) => !o && setLoseId(null)} pending={loseMut.isPending} onConfirm={confirmLose} />
      <DealDetailSheet open={detailDeal !== null} onOpenChange={(o) => !o && setDetailDeal(null)} deal={detailDeal} />
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  canMove,
  formatMoney,
  onOpen,
}: {
  stage: SalesStageDto;
  deals: DealDto[];
  canMove: boolean;
  formatMoney: (a: string, c: string) => string;
  onOpen: (d: DealDto) => void;
}) {
  const { t } = useTranslation('sales');
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface-alt/40 transition-colors',
        isOver && 'ring-2 ring-primary/40 bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-text-primary">{stage.name}</span>
        <span className="text-xs text-text-muted tabular-nums">{deals.length}</span>
      </div>
      <div className="flex-1 space-y-2 p-2 min-h-[120px]">
        {deals.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-text-muted">{t('pipeline.empty')}</p>
        ) : (
          deals.map((d) => <DealCard key={d.id} deal={d} canMove={canMove} formatMoney={formatMoney} onOpen={onOpen} />)
        )}
      </div>
      {total > 0 && (
        <div className="border-t border-border px-3 py-2 text-xs text-text-secondary tabular-nums">
          {formatMoney(String(total), deals[0]?.currency ?? 'VND')}
        </div>
      )}
    </div>
  );
}

function DealCard({
  deal,
  canMove,
  formatMoney,
  onOpen,
}: {
  deal: DealDto;
  canMove: boolean;
  formatMoney: (a: string, c: string) => string;
  onOpen: (d: DealDto) => void;
}) {
  const { t } = useTranslation('sales');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: !canMove });
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-md border border-border bg-surface p-2.5 shadow-xs', isDragging && 'opacity-50')}
    >
      <div className="flex items-start gap-1.5">
        {canMove && <GripVertical size={14} className="mt-0.5 shrink-0 cursor-grab text-text-muted active:cursor-grabbing" {...attributes} {...(listeners as object)} />}
        <button type="button" onClick={() => onOpen(deal)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-text-primary hover:text-primary">{deal.title}</p>
          <p className="truncate text-xs text-text-muted">{deal.customer?.fullName ?? t('deal.noCustomer')}</p>
          <p className="mt-1 text-xs font-semibold text-primary tabular-nums">{formatMoney(deal.amount, deal.currency)}</p>
        </button>
      </div>
    </div>
  );
}
