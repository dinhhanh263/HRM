import { describe, it, expect } from 'vitest';
import { notificationLink } from './notification-link';

describe('notificationLink', () => {
  it('deep-links a probation_ending reminder to /probation', () => {
    expect(notificationLink({ kind: 'probation_ending' })).toBe('/probation');
  });

  it('returns null for kinds without a destination', () => {
    expect(notificationLink({ kind: 'contract_expiring' })).toBeNull();
    expect(notificationLink({ kind: 'unknown_kind' })).toBeNull();
  });
});
