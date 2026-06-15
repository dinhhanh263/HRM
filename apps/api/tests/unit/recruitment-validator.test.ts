import { describe, it, expect } from 'vitest';
import {
  createInterviewSchema,
  createCandidateSchema,
} from '../../src/app/validators/recruitment.validator.js';

// z.string().url() alone accepts javascript:/data: URLs, which become stored-XSS
// vectors once rendered as an href. These guards must reject non-http(s) schemes.
describe('recruitment validator — URL scheme hardening', () => {
  const baseInterview = {
    applicationId: 'app-1',
    scheduledAt: '2026-07-01T09:00:00.000Z',
    mode: 'VIDEO' as const,
    interviewerIds: ['emp-1'],
  };

  it('rejects a javascript: meeting URL', () => {
    expect(() =>
      createInterviewSchema.parse({ ...baseInterview, meetingUrl: 'javascript:alert(1)' })
    ).toThrow();
  });

  it('accepts an https meeting URL', () => {
    expect(() =>
      createInterviewSchema.parse({ ...baseInterview, meetingUrl: 'https://meet.example.com/x' })
    ).not.toThrow();
  });

  it('rejects a non-http(s) candidate link', () => {
    expect(() =>
      createCandidateSchema.parse({
        fullName: 'Trần Văn A',
        links: { linkedin: 'javascript:alert(1)' },
      })
    ).toThrow();
  });

  it('accepts http(s) candidate links', () => {
    expect(() =>
      createCandidateSchema.parse({
        fullName: 'Trần Văn A',
        links: { linkedin: 'https://linkedin.com/in/a', github: 'http://github.com/a' },
      })
    ).not.toThrow();
  });
});
