import { describe, expect, it } from 'vitest';
import { groupApplicationsByStage } from './pipeline-grouping';

type App = { id: string; currentStageId: string; status: 'ACTIVE' | 'HIRED' | 'REJECTED' | 'WITHDRAWN' | 'ON_HOLD' };

const stages = [
  { id: 'screen' },
  { id: 'interview' },
  { id: 'offer' },
  { id: 'hired' },
  { id: 'rejected' },
];

function app(id: string, currentStageId: string, status: App['status']): App {
  return { id, currentStageId, status };
}

describe('groupApplicationsByStage', () => {
  it('creates an empty bucket for every stage', () => {
    const map = groupApplicationsByStage([], stages);
    expect([...map.keys()]).toEqual(['screen', 'interview', 'offer', 'hired', 'rejected']);
    for (const list of map.values()) expect(list).toEqual([]);
  });

  it('places active applications in their current stage column', () => {
    const map = groupApplicationsByStage([app('a', 'interview', 'ACTIVE')], stages);
    expect(map.get('interview')!.map((a) => a.id)).toEqual(['a']);
  });

  it('keeps a hired application visible on the HIRED stage (regression: card vanished)', () => {
    // Hire moves currentStageId onto the HIRED stage and closes the application.
    const map = groupApplicationsByStage([app('a', 'hired', 'HIRED')], stages);
    expect(map.get('hired')!.map((a) => a.id)).toEqual(['a']);
  });

  it('keeps a rejected application on the stage it ended on', () => {
    // Reject closes the application but leaves currentStageId where it was.
    const map = groupApplicationsByStage([app('a', 'offer', 'REJECTED')], stages);
    expect(map.get('offer')!.map((a) => a.id)).toEqual(['a']);
  });

  it('keeps a withdrawn application visible too', () => {
    const map = groupApplicationsByStage([app('a', 'screen', 'WITHDRAWN')], stages);
    expect(map.get('screen')!.map((a) => a.id)).toEqual(['a']);
  });

  it('sorts closed applications below active ones within the same column', () => {
    const map = groupApplicationsByStage(
      [
        app('closed', 'offer', 'REJECTED'),
        app('live', 'offer', 'ACTIVE'),
      ],
      stages
    );
    expect(map.get('offer')!.map((a) => a.id)).toEqual(['live', 'closed']);
  });

  it('ignores applications whose stage is not on the board (no throw)', () => {
    const map = groupApplicationsByStage([app('a', 'ghost-stage', 'ACTIVE')], stages);
    for (const list of map.values()) expect(list).toEqual([]);
  });
});
