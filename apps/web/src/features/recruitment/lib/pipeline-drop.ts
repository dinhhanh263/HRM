import type { StageType } from '@hrm/shared';

/**
 * The outcome of dropping (or menu-selecting) a candidate card onto a stage.
 * - `move`    — plain stage transition via move().
 * - `force`   — OFFER gate is unmet but the actor may override → open ForceMoveDialog.
 * - `hire`    — terminal HIRED → open the hire confirmation dialog (never move()).
 * - `reject`  — terminal REJECTED → open the reject dialog (never move()).
 * - `blocked` — not a valid target for this actor/state; no-op with a hint.
 * - `noop`    — dropped back onto the card's current column; do nothing.
 */
export type DropAction = 'move' | 'force' | 'hire' | 'reject' | 'blocked' | 'noop';

export interface DropContext {
  /** Stage type of the drop target column. */
  targetStageType: StageType;
  /** True when the target column is the card's current stage. */
  isSameStage: boolean;
  /** SPEC-028 OFFER gate signal for this application (server-computed). */
  offerGateMet: boolean;
  /** Actor has `recruitment:application_move`. */
  canMove: boolean;
  /** Actor has `recruitment:application_force_move`. */
  canForce: boolean;
  /** Actor has `recruitment:application_hire`. */
  canHire: boolean;
  /** Actor has `recruitment:application_reject`. */
  canReject: boolean;
}

/**
 * Single source of truth for what a drop should do. Both the drag-and-drop path
 * and the "..." menu route through this so the two stay consistent. Pure: no UI,
 * no I/O. The backend (SPEC-028) remains the real source of truth — this only
 * drives client UX (which targets are valid, which dialog to open).
 */
export function resolveDropAction(ctx: DropContext): DropAction {
  // Dropping a card onto its own column is always a no-op, even for terminals.
  if (ctx.isSameStage) return 'noop';

  switch (ctx.targetStageType) {
    // Terminal stages never go through move(); they open a disposition dialog
    // and are gated purely by the matching capability (not canMove).
    case 'HIRED':
      return ctx.canHire ? 'hire' : 'blocked';
    case 'REJECTED':
      return ctx.canReject ? 'reject' : 'blocked';

    // OFFER respects the gate: a plain move when met, a force override when the
    // actor is capable, otherwise blocked.
    case 'OFFER':
      if (!ctx.canMove) return 'blocked';
      if (ctx.offerGateMet) return 'move';
      return ctx.canForce ? 'force' : 'blocked';

    // Every other (non-gated) stage is a plain move when the actor can move.
    default:
      return ctx.canMove ? 'move' : 'blocked';
  }
}
