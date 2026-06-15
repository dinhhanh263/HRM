import { describe, it, expect } from 'vitest';
import { assertStageTransitionAllowed } from '../../src/domain/recruitment/stage-transition.policy.js';
import type { StageTransitionContext } from '../../src/domain/recruitment/stage-transition.policy.js';
import { AppError, ConflictError } from '../../src/shared/errors/AppError.js';

// The policy is a pure decision function: given the target stage type, the
// interview signals on the application, and the actor's force capability, it
// either returns (transition allowed) or throws a business error. No I/O.
function ctx(overrides: Partial<StageTransitionContext> = {}): StageTransitionContext {
  return {
    targetStageType: 'SCREEN',
    signals: { hasCompletedInterview: false, hasSubmittedScorecard: false },
    actorCanForce: false,
    force: false,
    note: undefined,
    ...overrides,
  };
}

describe('stage-transition policy', () => {
  describe('Invariant — terminal stages are never reachable via move()', () => {
    it('blocks a move to a HIRED stage', () => {
      expect(() => assertStageTransitionAllowed(ctx({ targetStageType: 'HIRED' }))).toThrow(
        ConflictError
      );
      try {
        assertStageTransitionAllowed(ctx({ targetStageType: 'HIRED' }));
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_MOVE_TO_TERMINAL');
      }
    });

    it('blocks a move to a REJECTED stage', () => {
      try {
        assertStageTransitionAllowed(ctx({ targetStageType: 'REJECTED' }));
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_MOVE_TO_TERMINAL');
      }
    });

    it('blocks terminal even when the actor can force with a reason — force never bypasses an invariant', () => {
      try {
        assertStageTransitionAllowed(
          ctx({ targetStageType: 'HIRED', actorCanForce: true, force: true, note: 'exec hire' })
        );
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_MOVE_TO_TERMINAL');
      }
    });
  });

  describe('Gate — OFFER requires interview signal', () => {
    it('allows OFFER when there is a completed interview AND a submitted scorecard', () => {
      expect(() =>
        assertStageTransitionAllowed(
          ctx({
            targetStageType: 'OFFER',
            signals: { hasCompletedInterview: true, hasSubmittedScorecard: true },
          })
        )
      ).not.toThrow();
    });

    it('blocks OFFER when there is no completed interview', () => {
      try {
        assertStageTransitionAllowed(
          ctx({
            targetStageType: 'OFFER',
            signals: { hasCompletedInterview: false, hasSubmittedScorecard: true },
          })
        );
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_OFFER_GATE_UNMET');
      }
    });

    it('blocks OFFER when there is a completed interview but no submitted scorecard', () => {
      try {
        assertStageTransitionAllowed(
          ctx({
            targetStageType: 'OFFER',
            signals: { hasCompletedInterview: true, hasSubmittedScorecard: false },
          })
        );
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_OFFER_GATE_UNMET');
      }
    });
  });

  describe('Override — force move with mandatory reason', () => {
    it('blocks an actor without the force capability even if force=true', () => {
      try {
        assertStageTransitionAllowed(
          ctx({ targetStageType: 'OFFER', actorCanForce: false, force: true, note: 'a reason' })
        );
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_OFFER_GATE_UNMET');
      }
    });

    it('blocks a capable actor who did not explicitly set force', () => {
      try {
        assertStageTransitionAllowed(
          ctx({ targetStageType: 'OFFER', actorCanForce: true, force: false })
        );
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ConflictError).code).toBe('APPLICATION_OFFER_GATE_UNMET');
      }
    });

    it('requires a non-empty reason when forcing through the gate', () => {
      for (const note of [undefined, '', '   ']) {
        try {
          assertStageTransitionAllowed(
            ctx({ targetStageType: 'OFFER', actorCanForce: true, force: true, note })
          );
          throw new Error('should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(AppError);
          expect((e as AppError).code).toBe('FORCE_MOVE_REASON_REQUIRED');
          expect((e as AppError).statusCode).toBe(422);
        }
      }
    });

    it('allows a capable actor to force through with a reason', () => {
      expect(() =>
        assertStageTransitionAllowed(
          ctx({ targetStageType: 'OFFER', actorCanForce: true, force: true, note: 'strong referral' })
        )
      ).not.toThrow();
    });

    it('ignores force when the gate is already met (no reason needed)', () => {
      expect(() =>
        assertStageTransitionAllowed(
          ctx({
            targetStageType: 'OFFER',
            signals: { hasCompletedInterview: true, hasSubmittedScorecard: true },
            actorCanForce: true,
            force: true,
          })
        )
      ).not.toThrow();
    });
  });

  describe('Non-gated stages — unrestricted', () => {
    it.each(['SOURCED', 'SCREEN', 'ASSESSMENT', 'INTERVIEW'] as const)(
      'allows a move to %s with no interview signal',
      (targetStageType) => {
        expect(() => assertStageTransitionAllowed(ctx({ targetStageType }))).not.toThrow();
      }
    );
  });
});
