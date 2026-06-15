import type { StageType } from '@prisma/client';
import { AppError, ConflictError } from '../../shared/errors/AppError.js';

// Interview-readiness signals for an application, computed by the service from
// the interview + scorecard repositories. The policy itself stays pure.
export interface StageTransitionSignals {
  hasCompletedInterview: boolean;
  hasSubmittedScorecard: boolean;
}

export interface StageTransitionContext {
  // The StageType of the destination stage the application is being moved into.
  targetStageType: StageType;
  signals: StageTransitionSignals;
  // Whether the acting user holds recruitment:application_force_move.
  actorCanForce: boolean;
  // Whether the request explicitly asked to override a soft gate.
  force: boolean;
  // Reason recorded on the stage history when forcing — mandatory for an override.
  note?: string | null;
}

// Terminal stages are owned by the disposition flow (hire()/reject()), never by
// the generic move(). Moving into one would leave status=ACTIVE on a stage that
// means "closed" — a data invariant violation, so this can never be overridden.
const TERMINAL_STAGE_TYPES: ReadonlySet<StageType> = new Set<StageType>(['HIRED', 'REJECTED']);

// Stage types guarded by a soft gate. OFFER is the commitment point: a candidate
// should not reach it without a real interview signal (a completed interview and
// at least one submitted scorecard). A privileged actor may force past it with a
// recorded reason, because real hiring sometimes legitimately skips the system.
function isOfferGateMet(signals: StageTransitionSignals): boolean {
  return signals.hasCompletedInterview && signals.hasSubmittedScorecard;
}

/**
 * Decide whether a stage transition via move() is allowed. Returns silently when
 * permitted; throws an operational error (with a stable code for the client to
 * i18n) when blocked. Pure — all signals are passed in, no I/O here.
 */
export function assertStageTransitionAllowed(ctx: StageTransitionContext): void {
  // Tier 1 — Invariant: terminal stages are unreachable, force included.
  if (TERMINAL_STAGE_TYPES.has(ctx.targetStageType)) {
    throw new ConflictError(
      'Không thể chuyển bước vào trạng thái kết thúc; dùng thao tác Tuyển/Từ chối',
      'APPLICATION_MOVE_TO_TERMINAL'
    );
  }

  // Tier 2 — Gate: only OFFER is gated in this iteration.
  if (ctx.targetStageType === 'OFFER' && !isOfferGateMet(ctx.signals)) {
    // Tier 3 — Override: a capable actor who explicitly forces, with a reason.
    const overriding = ctx.actorCanForce && ctx.force;
    if (!overriding) {
      throw new ConflictError(
        'Cần hoàn tất phỏng vấn và có đánh giá trước khi chuyển sang Offer',
        'APPLICATION_OFFER_GATE_UNMET'
      );
    }
    if (!ctx.note || ctx.note.trim() === '') {
      throw new AppError(
        'Cần nhập lý do khi vượt cổng kiểm soát chuyển bước',
        422,
        'FORCE_MOVE_REASON_REQUIRED'
      );
    }
  }
}
