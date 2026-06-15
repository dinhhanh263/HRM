import { describe, it, expect } from 'vitest';
import { resolveDropAction } from './pipeline-drop';
import type { DropContext } from './pipeline-drop';

// resolveDropAction is the SINGLE source of truth for what a drop should do.
// Both the drag-and-drop path and the "..." menu must agree with it, so it is a
// pure function: given the target stage type, whether it's the card's current
// stage, the OFFER gate signal, and the actor's capabilities, it returns one of
// 'move' | 'force' | 'hire' | 'reject' | 'blocked' | 'noop'. No UI, no I/O.
//
// It mirrors the server-side SPEC-028 policy intent on the client purely for UX
// (the backend stays the source of truth): terminal stages never go through
// move(); OFFER respects the gate; force requires the capability.
function ctx(overrides: Partial<DropContext> = {}): DropContext {
  return {
    targetStageType: 'SCREEN',
    isSameStage: false,
    offerGateMet: false,
    canMove: true,
    canForce: false,
    canHire: false,
    canReject: false,
    ...overrides,
  };
}

describe('resolveDropAction', () => {
  describe('No-op — dropping a card back onto its own column', () => {
    it('returns noop when the target is the same stage', () => {
      expect(resolveDropAction(ctx({ isSameStage: true }))).toBe('noop');
    });

    it('returns noop even for a terminal same-stage drop', () => {
      expect(
        resolveDropAction(ctx({ isSameStage: true, targetStageType: 'HIRED', canHire: true }))
      ).toBe('noop');
    });
  });

  describe('Normal stages — plain move', () => {
    it.each(['SOURCED', 'SCREEN', 'ASSESSMENT', 'INTERVIEW'] as const)(
      'returns move for %s when the actor can move',
      (targetStageType) => {
        expect(resolveDropAction(ctx({ targetStageType }))).toBe('move');
      }
    );

    it('returns blocked for a normal stage when the actor cannot move', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'INTERVIEW', canMove: false }))).toBe(
        'blocked'
      );
    });
  });

  describe('OFFER — respects the gate', () => {
    it('returns move when the gate is met', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'OFFER', offerGateMet: true }))).toBe('move');
    });

    it('returns force when gate is unmet but the actor can force', () => {
      expect(
        resolveDropAction(ctx({ targetStageType: 'OFFER', offerGateMet: false, canForce: true }))
      ).toBe('force');
    });

    it('returns blocked when gate is unmet and the actor cannot force', () => {
      expect(
        resolveDropAction(ctx({ targetStageType: 'OFFER', offerGateMet: false, canForce: false }))
      ).toBe('blocked');
    });

    it('returns blocked when the actor cannot move at all, regardless of gate/force', () => {
      expect(
        resolveDropAction(
          ctx({ targetStageType: 'OFFER', offerGateMet: true, canMove: false, canForce: true })
        )
      ).toBe('blocked');
    });
  });

  describe('Terminal stages — never via move(); disposition dialogs only', () => {
    it('returns hire for HIRED when the actor can hire', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'HIRED', canHire: true }))).toBe('hire');
    });

    it('returns blocked for HIRED when the actor cannot hire', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'HIRED', canHire: false }))).toBe('blocked');
    });

    it('returns reject for REJECTED when the actor can reject', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'REJECTED', canReject: true }))).toBe(
        'reject'
      );
    });

    it('returns blocked for REJECTED when the actor cannot reject', () => {
      expect(resolveDropAction(ctx({ targetStageType: 'REJECTED', canReject: false }))).toBe(
        'blocked'
      );
    });

    it('does not require canMove for a terminal disposition', () => {
      expect(
        resolveDropAction(ctx({ targetStageType: 'HIRED', canMove: false, canHire: true }))
      ).toBe('hire');
    });
  });
});
