import { describe, it, expect } from 'vitest';
import { buildSetPasswordLink } from '../../src/shared/configs/email.config.js';
import {
  emailProvider,
  createEmailProvider,
  escapeHtml,
} from '../../src/infrastructure/email/email.provider.js';

describe('buildSetPasswordLink', () => {
  it('builds a set-password URL with the token in the query string', () => {
    const link = buildSetPasswordLink('abc123');
    expect(link).toContain('/set-password?token=abc123');
  });

  it('url-encodes tokens that contain reserved characters', () => {
    const link = buildSetPasswordLink('a b+c/d');
    expect(link).toContain('/set-password?token=a%20b%2Bc%2Fd');
    expect(link).not.toContain(' ');
  });
});

describe('escapeHtml', () => {
  it('neutralizes markup in user-controlled names so they cannot inject HTML', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml(`Tom & "Jerry" <b>'x'</b>`)).toBe(
      'Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;x&#39;&lt;/b&gt;',
    );
  });

  it('leaves plain names untouched', () => {
    expect(escapeHtml('Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });
});

describe('emailProvider.sendInvite (no RESEND_API_KEY)', () => {
  it('no-ops gracefully instead of throwing when the key is unset', async () => {
    // Tests run with RESEND_API_KEY empty; sending must not crash the import.
    await expect(
      emailProvider.sendInvite({
        to: 'nobody@example.com',
        fullName: 'Nobody',
        link: 'http://localhost:5173/set-password?token=x',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('emailProvider.sendPayrollApprovalRequest (no RESEND_API_KEY)', () => {
  it('no-ops gracefully instead of throwing when the key is unset', async () => {
    // Best-effort notification: without a key it must warn-and-skip, never throw,
    // so HR's "submit for approval" can't be broken by email being unconfigured.
    // Build a keyless provider explicitly so the assertion is deterministic
    // regardless of whether the ambient RESEND_API_KEY is set.
    const keyless = createEmailProvider('');
    await expect(
      keyless.sendPayrollApprovalRequest({
        to: 'approver@example.com',
        approverName: 'Approver',
        period: '2028-01',
        headcount: 12,
        totalNet: '350.000.000',
        link: 'http://localhost:5173/payroll',
      }),
    ).resolves.toBeUndefined();
  });
});
