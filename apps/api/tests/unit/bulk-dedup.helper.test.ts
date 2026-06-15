import { describe, it, expect } from 'vitest';
import { computeDedup, type DedupCandidate } from '../../src/domain/recruitment/bulk-dedup.helper.js';

const existing: DedupCandidate[] = [
  { id: 'c1', email: 'Cuong.Le@example.com', phone: '+84901234567', fullName: 'Lê Văn Cường' },
  { id: 'c2', email: 'mai@example.com', phone: '+84988887777', fullName: 'Trần Thị Mai' },
];

describe('computeDedup', () => {
  it('links to an existing candidate on a case-insensitive email match', () => {
    const r = computeDedup({ email: 'cuong.le@EXAMPLE.com' }, existing, []);
    expect(r).toEqual({ resolution: 'LINK_EXISTING', duplicateOfCandidateId: 'c1', duplicateReason: 'EMAIL' });
  });

  it('links on a phone match after E.164 normalization (local 0-prefixed form)', () => {
    const r = computeDedup({ phone: '0901 234 567' }, existing, []);
    expect(r).toEqual({ resolution: 'LINK_EXISTING', duplicateOfCandidateId: 'c1', duplicateReason: 'PHONE' });
  });

  it('flags a diacritic-insensitive name match but stays NEW (weak signal)', () => {
    const r = computeDedup({ fullName: 'Le Van Cuong' }, existing, []);
    expect(r).toEqual({ resolution: 'NEW', duplicateOfCandidateId: 'c1', duplicateReason: 'NAME' });
  });

  it('flags an intra-batch email collision and keeps NEW (no candidate to link yet)', () => {
    const r = computeDedup({ email: 'new@example.com' }, existing, [{ email: 'NEW@example.com' }]);
    expect(r).toEqual({ resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: 'BATCH_EMAIL' });
  });

  it('flags an intra-batch phone collision and keeps NEW', () => {
    const r = computeDedup({ phone: '0911222333' }, existing, [{ phone: '+84911222333' }]);
    expect(r).toEqual({ resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: 'BATCH_PHONE' });
  });

  it('prefers an existing hard-key match over an intra-batch collision', () => {
    const r = computeDedup({ email: 'cuong.le@example.com' }, existing, [{ email: 'cuong.le@example.com' }]);
    expect(r.resolution).toBe('LINK_EXISTING');
    expect(r.duplicateReason).toBe('EMAIL');
  });

  it('returns a clean NEW when nothing matches', () => {
    const r = computeDedup({ email: 'fresh@example.com', phone: '0900000000', fullName: 'Brand New' }, existing, []);
    expect(r).toEqual({ resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: null });
  });

  it('ignores empty/garbage fields without false-matching blank candidate data', () => {
    const r = computeDedup({ email: '', phone: 'abc', fullName: '' }, existing, []);
    expect(r).toEqual({ resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: null });
  });
});
