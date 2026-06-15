import { describe, it, expect } from 'vitest';
import {
  selectDueReminders,
  buildDedupeKey,
  formatReminderContent,
  ictISODate,
  PROBATION_LEAD_DAYS,
  CONTRACT_LEAD_DAYS,
  type ProbationCandidate,
  type ContractCandidate,
} from '../../src/domain/reminders/reminders.service.js';

// A fixed "now": 2026-06-04T03:00:00Z == 2026-06-04 10:00 ICT. Day math below is
// expressed in ICT calendar days relative to this instant.
const NOW = new Date('2026-06-04T03:00:00.000Z');

/** Midnight-UTC instant for an ICT calendar date `today + offsetDays`. */
function dateAtOffset(offsetDays: number): Date {
  const base = Date.UTC(2026, 5, 4); // 2026-06-04 00:00Z
  return new Date(base + offsetDays * 86_400_000);
}

function probation(offsetDays: number, id = 'emp1'): ProbationCandidate {
  return {
    tenantId: 't1',
    employeeId: id,
    employeeName: 'Nguyễn Văn A',
    probationEndDate: dateAtOffset(offsetDays),
  };
}

function contract(offsetDays: number, id = 'con1'): ContractCandidate {
  return {
    tenantId: 't1',
    contractId: id,
    employeeId: 'emp9',
    employeeName: 'Trần Thị B',
    endDate: dateAtOffset(offsetDays),
  };
}

describe('reminders.service — selectDueReminders', () => {
  it('fires a probation reminder inside the [today, today+7] window', () => {
    const due = selectDueReminders([probation(5)], [], NOW);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      kind: 'probation_ending',
      entityType: 'employee',
      entityId: 'emp1',
      daysUntil: 5,
    });
  });

  it('fires probation on both window boundaries (today and today+7)', () => {
    const due = selectDueReminders([probation(0, 'a'), probation(PROBATION_LEAD_DAYS, 'b')], [], NOW);
    expect(due.map((d) => d.entityId).sort()).toEqual(['a', 'b']);
  });

  it('excludes probation past the lead (today+8) and in the past (yesterday)', () => {
    const due = selectDueReminders([probation(PROBATION_LEAD_DAYS + 1, 'late'), probation(-1, 'gone')], [], NOW);
    expect(due).toHaveLength(0);
  });

  it('fires a contract reminder inside the [today, today+30] window', () => {
    const due = selectDueReminders([], [contract(20)], NOW);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      kind: 'contract_expiring',
      entityType: 'contract',
      entityId: 'con1',
      daysUntil: 20,
    });
  });

  it('excludes a contract one day past the lead (today+31)', () => {
    const due = selectDueReminders([], [contract(CONTRACT_LEAD_DAYS + 1)], NOW);
    expect(due).toHaveLength(0);
  });

  it('fires contract on the far boundary (today+30)', () => {
    const due = selectDueReminders([], [contract(CONTRACT_LEAD_DAYS)], NOW);
    expect(due).toHaveLength(1);
  });

  it('evaluates the window in ICT even when the instant is late-evening UTC', () => {
    // 2026-06-04T20:00Z == 2026-06-05 03:00 ICT, so the ICT "today" is the 5th.
    const lateNow = new Date('2026-06-04T20:00:00.000Z');
    // A date at ICT 2026-06-05 is "today" → daysUntil 0, still fires.
    const due = selectDueReminders([probation(1, 'x')], [], lateNow);
    expect(due).toHaveLength(1);
    expect(due[0].daysUntil).toBe(0);
  });
});

describe('reminders.service — dedupeKey & content', () => {
  it('builds a stable {kind}:{entityId}:{dueDate} dedupe key', () => {
    expect(buildDedupeKey('probation_ending', 'emp1', '2026-06-09')).toBe(
      'probation_ending:emp1:2026-06-09',
    );
    const due = selectDueReminders([probation(5, 'emp1')], [], NOW);
    expect(due[0].dedupeKey).toBe(`probation_ending:emp1:${ictISODate(dateAtOffset(5))}`);
  });

  it('produces Vietnamese probation copy with a Vietnamese day count', () => {
    const [r] = selectDueReminders([probation(7, 'emp1')], [], NOW);
    const { title, body } = formatReminderContent(r);
    expect(title).toBe('Nguyễn Văn A sắp hết thử việc');
    expect(body).toContain('(còn 7 ngày)');
  });

  it('says "hôm nay" when the reminder is due today', () => {
    const [r] = selectDueReminders([], [contract(0)], NOW);
    expect(formatReminderContent(r).body).toContain('(hôm nay)');
  });
});

// SPEC-036 — tenant-configurable leads: a tenant can widen or shrink its
// reminder windows; tenants without overrides keep the engine defaults.
describe('reminders.service — per-tenant lead overrides (SPEC-036)', () => {
  it('fires a probation reminder beyond the default lead when the tenant widened it', () => {
    const leads = new Map([['t1', { probationLeadDays: 14, contractLeadDays: 30 }]]);
    const due = selectDueReminders([probation(10)], [], NOW, leads);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('probation_ending');
  });

  it('keeps the default lead for tenants without an override', () => {
    const leads = new Map([['other-tenant', { probationLeadDays: 14, contractLeadDays: 60 }]]);
    expect(selectDueReminders([probation(10)], [], NOW, leads)).toHaveLength(0);
  });

  it('applies a widened contract lead', () => {
    const leads = new Map([['t1', { probationLeadDays: 7, contractLeadDays: 60 }]]);
    const due = selectDueReminders([], [contract(45)], NOW, leads);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('contract_expiring');
  });

  it('can shrink a lead below the default', () => {
    const leads = new Map([['t1', { probationLeadDays: 3, contractLeadDays: 30 }]]);
    expect(selectDueReminders([probation(5)], [], NOW, leads)).toHaveLength(0);
  });
});
