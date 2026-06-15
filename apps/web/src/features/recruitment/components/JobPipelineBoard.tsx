import { useMemo, useState, type KeyboardEventHandler, type PointerEventHandler, type TouchEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  Ban,
  ChevronsRight,
  CircleSlash,
  GripVertical,
  Lock,
  MoreHorizontal,
  UserCheck,
  Users,
} from 'lucide-react';
import type { ApplicationDto, JobDto, JobStageDto, RejectionReason } from '@hrm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from '@/components/ui/toast';
import { cn, getInitials } from '@/lib/utils';
import {
  useJobApplications,
  useMoveApplication,
  useRejectApplication,
  useHireApplication,
  useWithdrawApplication,
} from '../hooks/useApplications';
import { RejectApplicationDialog } from './RejectApplicationDialog';
import { ForceMoveDialog } from './ForceMoveDialog';
import { ApplicationDetailSheet } from './ApplicationDetailSheet';
import { resolveDropAction } from '../lib/pipeline-drop';
import { groupApplicationsByStage } from '../lib/pipeline-grouping';

/**
 * Prefer the column the pointer is actually inside. The DragOverlay is a full
 * card-width wide, so geometric heuristics (closestCorners/closestCenter) skew
 * toward the column to the right of the cursor — dropping a card onto OFFER could
 * silently land it on HIRED. `pointerWithin` follows the real cursor; we only
 * fall back to `closestCorners` when there is no pointer (KeyboardSensor).
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

// Badge styling per closed status — semantic colour conveys the outcome at a
// glance (hired = success, rejected = danger, withdrawn/on-hold = neutral/warn).
const CLOSED_STATUS_BADGE: Record<string, string> = {
  HIRED: 'bg-success-light text-success',
  REJECTED: 'bg-danger-light text-danger',
  WITHDRAWN: 'bg-surface-alt text-text-secondary',
  ON_HOLD: 'bg-warning-light text-warning',
};

interface JobPipelineBoardProps {
  job: JobDto;
  canMove: boolean;
  canForce: boolean;
  canReject: boolean;
  canHire: boolean;
  canWithdraw: boolean;
  canNote: boolean;
  canSchedule: boolean;
}

function CandidateCard({
  app,
  stages,
  canMove,
  canForce,
  canReject,
  canHire,
  canWithdraw,
  onMove,
  onForceMove,
  onReject,
  onHire,
  onWithdraw,
  onOpenDetail,
  isBusy,
}: {
  app: ApplicationDto;
  stages: JobStageDto[];
  canMove: boolean;
  canForce: boolean;
  canReject: boolean;
  canHire: boolean;
  canWithdraw: boolean;
  onMove: (toStage: JobStageDto) => void;
  onForceMove: (toStage: JobStageDto) => void;
  onReject: () => void;
  onHire: () => void;
  onWithdraw: () => void;
  onOpenDetail: () => void;
  isBusy: boolean;
}) {
  const { t } = useTranslation('recruitment');
  // A closed application (hired/rejected/withdrawn/on-hold) is frozen: it stays on
  // the board as a record but can no longer be dragged or actioned (the backend
  // rejects any disposition on a non-ACTIVE row anyway).
  const isClosed = app.status !== 'ACTIVE';
  // Terminal stages (HIRED/REJECTED) are reached only through their dedicated
  // dispositions — never a plain move — so they are excluded as move targets.
  const moveTargets = stages.filter(
    (s) => s.id !== app.currentStageId && s.type !== 'HIRED' && s.type !== 'REJECTED'
  );
  const hasMenu = !isClosed && (canMove || canReject || canHire || canWithdraw);
  const hasDisposition = canReject || canHire || canWithdraw;

  // A card is draggable only when it's still open, the actor can move it, and no
  // mutation is in flight. Pointer drag is carried by the WHOLE card (grab
  // anywhere); the grip is the keyboard activator + a visual affordance. The "..."
  // menu stops pointer propagation so opening it never starts a drag; a short click
  // on the name still opens the detail sheet (PointerSensor's 6px threshold
  // separates click vs drag).
  const draggable = canMove && !isBusy && !isClosed;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { app },
    disabled: !draggable,
  });
  // dnd-kit types each listener loosely as `Function`; narrow to React handlers so
  // pointer/touch drag can live on the card root and keyboard drag on the grip.
  const dragListeners = listeners as
    | {
        onPointerDown?: PointerEventHandler;
        onTouchStart?: TouchEventHandler;
        onKeyDown?: KeyboardEventHandler;
      }
    | undefined;

  // The OFFER stage is gated behind a completed interview + a submitted scorecard.
  // When the gate is unmet, a non-privileged actor sees it disabled; an actor with
  // force capability sees it enabled and is routed through the reason dialog.
  function isGateBlocked(stage: JobStageDto) {
    return stage.type === 'OFFER' && app.offerGateMet === false;
  }

  return (
    <div
      ref={setNodeRef}
      // Whole-card POINTER/TOUCH drag: grab anywhere on the card to lift it.
      // Keyboard activation lives on the grip button (onKeyDown) so the root
      // stays a plain, non-focusable div — no nested interactive roles around
      // the inner name/menu buttons.
      {...(draggable && dragListeners
        ? { onPointerDown: dragListeners.onPointerDown, onTouchStart: dragListeners.onTouchStart }
        : {})}
      className={cn(
        'rounded-md border border-border bg-surface p-3 transition-opacity select-none',
        // The whole card is the drag surface: grab anywhere to lift it.
        draggable && 'cursor-grab touch-none active:cursor-grabbing',
        // Frozen (closed) cards read as a muted record, not a live funnel card.
        isClosed && 'bg-surface-alt',
        isBusy && 'opacity-60',
        // The original stays in place (DragOverlay renders the moving ghost);
        // dim it so the source slot reads as "lifted".
        isDragging && 'opacity-40'
      )}
    >
      <div className="flex items-start gap-2.5">
        {draggable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            // Keyboard drag activator only — pointer/touch drag is on the card root.
            {...(dragListeners ? { onKeyDown: dragListeners.onKeyDown } : {})}
            aria-label={t('pipeline.board.dragHandle', { name: app.candidate.fullName })}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-text-muted hover:text-text-primary active:cursor-grabbing transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <GripVertical size={14} />
          </button>
        )}
        <Avatar style={{ width: 32, height: 32 }}>
          <AvatarImage src={app.candidate.avatar ?? undefined} alt={app.candidate.fullName} />
          <AvatarFallback style={{ fontSize: 12 }}>
            {getInitials(app.candidate.fullName)}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={t('activity.openDetail', { name: app.candidate.fullName })}
          className="min-w-0 flex-1 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <p className="text-sm font-medium text-text-primary truncate hover:text-primary transition-colors">
            {app.candidate.fullName}
          </p>
          {app.candidate.currentTitle && (
            <p className="text-xs text-text-muted truncate">{app.candidate.currentTitle}</p>
          )}
        </button>
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('pipeline.board.actionsMenu')}
              disabled={isBusy}
              // Opening the menu must never begin a card drag.
              onPointerDown={(e) => e.stopPropagation()}
              className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {canMove && moveTargets.length > 0 && (
                <>
                  <DropdownMenuLabel>{t('pipeline.board.moveStage')}</DropdownMenuLabel>
                  {moveTargets.map((stage) => {
                    const gateBlocked = isGateBlocked(stage);
                    // Gate unmet + no force capability → disabled with an
                    // explanatory tooltip; the candidate simply can't reach OFFER yet.
                    if (gateBlocked && !canForce) {
                      return (
                        <DropdownMenuItem
                          key={stage.id}
                          disabled
                          title={t('pipeline.board.offerGateTooltip')}
                        >
                          <Lock size={13} className="mr-2 text-text-muted" />
                          {stage.name}
                        </DropdownMenuItem>
                      );
                    }
                    // Gate unmet + force capability → route through the reason dialog.
                    if (gateBlocked) {
                      return (
                        <DropdownMenuItem
                          key={stage.id}
                          onSelect={() => onForceMove(stage)}
                          className="text-warning focus:text-warning"
                          title={t('pipeline.board.offerForceTooltip')}
                        >
                          <AlertTriangle size={13} className="mr-2" />
                          {stage.name}
                        </DropdownMenuItem>
                      );
                    }
                    return (
                      <DropdownMenuItem key={stage.id} onSelect={() => onMove(stage)}>
                        <ChevronsRight size={13} className="mr-2 text-text-muted" />
                        {stage.name}
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
              {canMove && moveTargets.length > 0 && hasDisposition && <DropdownMenuSeparator />}
              {hasDisposition && (
                <DropdownMenuLabel>{t('pipeline.board.disposition')}</DropdownMenuLabel>
              )}
              {canHire && (
                <DropdownMenuItem onSelect={onHire}>
                  <UserCheck size={13} className="mr-2 text-success" />
                  {t('pipeline.board.actions.hire')}
                </DropdownMenuItem>
              )}
              {canReject && (
                <DropdownMenuItem onSelect={onReject} className="text-danger focus:text-danger">
                  <Ban size={13} className="mr-2" />
                  {t('pipeline.board.actions.reject')}
                </DropdownMenuItem>
              )}
              {canWithdraw && (
                <DropdownMenuItem onSelect={onWithdraw}>
                  <CircleSlash size={13} className="mr-2 text-text-muted" />
                  {t('pipeline.board.actions.withdraw')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-text-secondary',
            // On a frozen card the source chip shares the muted card bg, so give
            // it a surface chip to stay legible.
            isClosed ? 'bg-surface border border-border' : 'bg-surface-alt'
          )}
        >
          {t(`candidate.source.${app.source}`)}
        </span>
        {isClosed && (
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 font-medium',
              CLOSED_STATUS_BADGE[app.status] ?? 'bg-surface-alt text-text-secondary'
            )}
          >
            {t(`application.status.${app.status}`)}
          </span>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  count,
  activeApp,
  canMove,
  canForce,
  canReject,
  canHire,
  children,
}: {
  stage: JobStageDto;
  count: number;
  activeApp: ApplicationDto | null;
  canMove: boolean;
  canForce: boolean;
  canReject: boolean;
  canHire: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('recruitment');
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage } });

  // While a card hovers this column, classify the drop with the *same* rule the
  // "..." menu and onDragEnd use, so the highlight never lies about what a drop
  // would do: valid (primary ring) vs blocked (danger ring) vs same column (idle).
  let dropState: 'idle' | 'valid' | 'invalid' = 'idle';
  if (activeApp && isOver) {
    const action = resolveDropAction({
      targetStageType: stage.type,
      isSameStage: stage.id === activeApp.currentStageId,
      offerGateMet: activeApp.offerGateMet ?? false,
      canMove,
      canForce,
      canHire,
      canReject,
    });
    dropState = action === 'noop' ? 'idle' : action === 'blocked' ? 'invalid' : 'valid';
  }

  return (
    <div
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg bg-surface-alt ring-2 ring-transparent transition-[box-shadow,background-color] duration-150',
        dropState === 'valid' && 'ring-primary bg-primary/5',
        dropState === 'invalid' && 'ring-danger bg-danger/5'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-text-primary truncate">{stage.name}</span>
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-surface text-xs font-medium text-text-secondary tabular-nums">
          {count}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-2 min-h-24">
        {count === 0 && dropState === 'idle' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Users size={18} className="text-text-muted mb-1.5" strokeWidth={1.5} />
            <p className="text-xs text-text-muted">{t('pipeline.board.emptyStage')}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function JobPipelineBoard({
  job,
  canMove,
  canForce,
  canReject,
  canHire,
  canWithdraw,
  canNote,
  canSchedule,
}: JobPipelineBoardProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const { data: applications, isLoading, error } = useJobApplications(job.id);
  const moveMutation = useMoveApplication(job.id);
  const rejectMutation = useRejectApplication(job.id);
  const hireMutation = useHireApplication(job.id);
  const withdrawMutation = useWithdrawApplication(job.id);

  // The application currently targeted by each disposition flow drives its dialog.
  const [rejectTarget, setRejectTarget] = useState<ApplicationDto | null>(null);
  const [hireTarget, setHireTarget] = useState<ApplicationDto | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<ApplicationDto | null>(null);
  // A forced move past a soft gate needs both the application and its target stage,
  // plus a mandatory reason captured in the dialog.
  const [forceTarget, setForceTarget] = useState<{ app: ApplicationDto; stage: JobStageDto } | null>(
    null
  );
  // The application whose detail sheet (activity feed + notes) is open.
  const [detailTarget, setDetailTarget] = useState<ApplicationDto | null>(null);
  // The card currently being dragged — drives the DragOverlay ghost and the
  // per-column drop-validity highlight.
  const [activeApp, setActiveApp] = useState<ApplicationDto | null>(null);

  // Pointer needs a small activation distance so a click (open detail / menu)
  // is never swallowed by a drag; touch waits briefly to avoid hijacking scroll;
  // keyboard gives full a11y (Space to lift, arrows to move, Space to drop).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const stages = useMemo(
    () => [...job.stages].sort((a, b) => a.order - b.order),
    [job.stages]
  );

  // Every application stays visible at its resting stage — closed ones (hired,
  // rejected, withdrawn) render as frozen cards below the active funnel so a
  // disposition never makes a card vanish from the board.
  const byStage = useMemo(
    () => groupApplicationsByStage(applications ?? [], stages),
    [applications, stages]
  );

  function handleMove(app: ApplicationDto, toStage: JobStageDto) {
    moveMutation.mutate(
      { applicationId: app.id, toStageId: toStage.id, toStage },
      {
        onSuccess: () =>
          toast.success(
            t('pipeline.board.moveToast', {
              name: app.candidate.fullName,
              stage: toStage.name,
            })
          ),
        onError: () => toast.error(t('pipeline.board.moveError')),
      }
    );
  }

  function handleForceMove(note: string) {
    if (!forceTarget) return;
    const { app, stage } = forceTarget;
    moveMutation.mutate(
      { applicationId: app.id, toStageId: stage.id, toStage: stage, note, force: true },
      {
        onSuccess: () => {
          toast.success(
            t('pipeline.board.moveToast', { name: app.candidate.fullName, stage: stage.name })
          );
          setForceTarget(null);
        },
        onError: () => toast.error(t('pipeline.board.moveError')),
      }
    );
  }

  function handleReject(input: { rejectionReason: RejectionReason; note?: string }) {
    if (!rejectTarget) return;
    const name = rejectTarget.candidate.fullName;
    rejectMutation.mutate(
      { applicationId: rejectTarget.id, ...input },
      {
        onSuccess: () => {
          toast.success(t('pipeline.board.rejectToast', { name }));
          setRejectTarget(null);
        },
        onError: () => toast.error(t('pipeline.board.dispositionError')),
      }
    );
  }

  function handleHire() {
    if (!hireTarget) return;
    const name = hireTarget.candidate.fullName;
    hireMutation.mutate(
      { applicationId: hireTarget.id },
      {
        onSuccess: () => {
          toast.success(t('pipeline.board.hireToast', { name }));
          setHireTarget(null);
        },
        onError: () => toast.error(t('pipeline.board.dispositionError')),
      }
    );
  }

  function handleWithdraw() {
    if (!withdrawTarget) return;
    const name = withdrawTarget.candidate.fullName;
    withdrawMutation.mutate(
      { applicationId: withdrawTarget.id },
      {
        onSuccess: () => {
          toast.success(t('pipeline.board.withdrawToast', { name }));
          setWithdrawTarget(null);
        },
        onError: () => toast.error(t('pipeline.board.dispositionError')),
      }
    );
  }

  function isBusy(appId: string) {
    return (
      (moveMutation.isPending && moveMutation.variables?.applicationId === appId) ||
      (rejectMutation.isPending && rejectMutation.variables?.applicationId === appId) ||
      (hireMutation.isPending && hireMutation.variables?.applicationId === appId) ||
      (withdrawMutation.isPending && withdrawMutation.variables?.applicationId === appId)
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const app = event.active.data.current?.app as ApplicationDto | undefined;
    setActiveApp(app ?? null);
  }

  // A drop routes through the SAME decision function as the menu, so drag and
  // menu can never diverge. The backend (SPEC-028) still re-validates everything.
  function handleDragEnd(event: DragEndEvent) {
    const dragged = activeApp;
    setActiveApp(null);
    const { over } = event;
    if (!dragged || !over) return;
    const stage = stages.find((s) => s.id === over.id);
    if (!stage) return;

    const action = resolveDropAction({
      targetStageType: stage.type,
      isSameStage: stage.id === dragged.currentStageId,
      offerGateMet: dragged.offerGateMet ?? false,
      canMove,
      canForce,
      canHire,
      canReject,
    });

    switch (action) {
      case 'move':
        handleMove(dragged, stage);
        break;
      case 'force':
        setForceTarget({ app: dragged, stage });
        break;
      case 'hire':
        setHireTarget(dragged);
        break;
      case 'reject':
        setRejectTarget(dragged);
        break;
      case 'blocked':
        toast.error(
          stage.type === 'OFFER'
            ? t('pipeline.board.offerGateTooltip')
            : t('pipeline.board.dropBlocked')
        );
        break;
      case 'noop':
        break;
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-64 shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-border bg-surface">
        <div className="size-12 rounded-full bg-danger-light flex items-center justify-center mb-3">
          <AlertTriangle className="size-5 text-danger" />
        </div>
        <p className="text-text-primary font-medium">{tc('states.error')}</p>
        <p className="text-text-muted text-sm mt-1">{t('pipeline.board.loadError')}</p>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        // Only auto-scroll within a narrow band at the board's horizontal edges,
        // and never vertically. A wide default band made columns slide under a
        // held cursor near the viewport edge, dropping cards one column too far.
        autoScroll={{ threshold: { x: 0.05, y: 0 } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveApp(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                count={items.length}
                activeApp={activeApp}
                canMove={canMove}
                canForce={canForce}
                canReject={canReject}
                canHire={canHire}
              >
                {items.map((app) => (
                  <CandidateCard
                    key={app.id}
                    app={app}
                    stages={stages}
                    canMove={canMove}
                    canForce={canForce}
                    canReject={canReject}
                    canHire={canHire}
                    canWithdraw={canWithdraw}
                    isBusy={isBusy(app.id)}
                    onMove={(toStage) => handleMove(app, toStage)}
                    onForceMove={(toStage) => setForceTarget({ app, stage: toStage })}
                    onReject={() => setRejectTarget(app)}
                    onHire={() => setHireTarget(app)}
                    onWithdraw={() => setWithdrawTarget(app)}
                    onOpenDetail={() => setDetailTarget(app)}
                  />
                ))}
              </StageColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeApp ? (
            <div className="w-60 rounded-md border border-border bg-surface p-3 shadow-lg cursor-grabbing">
              <div className="flex items-center gap-2.5">
                <Avatar style={{ width: 32, height: 32 }}>
                  <AvatarImage
                    src={activeApp.candidate.avatar ?? undefined}
                    alt={activeApp.candidate.fullName}
                  />
                  <AvatarFallback style={{ fontSize: 12 }}>
                    {getInitials(activeApp.candidate.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {activeApp.candidate.fullName}
                  </p>
                  {activeApp.candidate.currentTitle && (
                    <p className="text-xs text-text-muted truncate">
                      {activeApp.candidate.currentTitle}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <RejectApplicationDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        candidateName={rejectTarget?.candidate.fullName ?? ''}
        isPending={rejectMutation.isPending}
        onConfirm={handleReject}
      />

      <ForceMoveDialog
        open={!!forceTarget}
        onOpenChange={(open) => !open && setForceTarget(null)}
        candidateName={forceTarget?.app.candidate.fullName ?? ''}
        stageName={forceTarget?.stage.name ?? ''}
        isPending={moveMutation.isPending}
        onConfirm={handleForceMove}
      />

      <AlertDialog open={!!hireTarget} onOpenChange={(open) => !open && setHireTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pipeline.hireDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pipeline.hireDialog.description', { name: hireTarget?.candidate.fullName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleHire();
              }}
              disabled={hireMutation.isPending}
            >
              {hireMutation.isPending ? tc('states.saving') : t('pipeline.hireDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!withdrawTarget}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pipeline.withdrawDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pipeline.withdrawDialog.description', {
                name: withdrawTarget?.candidate.fullName ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleWithdraw();
              }}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending
                ? tc('states.saving')
                : t('pipeline.withdrawDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApplicationDetailSheet
        application={detailTarget}
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        canNote={canNote}
        canSchedule={canSchedule}
      />
    </>
  );
}
