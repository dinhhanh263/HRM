import { describe, it, expect, beforeEach } from 'vitest';
import {
  markLogin,
  markSessionActive,
  clearSessionMarkers,
  shouldResumeSession,
} from './session-persistence';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('session-persistence', () => {
  it('does not resume when no markers are set (never logged in)', () => {
    expect(shouldResumeSession()).toBe(false);
  });

  it('remember-me login persists across a fresh browser session', () => {
    markLogin(true);
    // Simulate a browser restart that drops sessionStorage but keeps localStorage.
    sessionStorage.clear();
    expect(shouldResumeSession()).toBe(true);
  });

  it('session-only login resumes within the same session (reload) but not after it ends', () => {
    markLogin(false);
    // Same session (reload keeps sessionStorage):
    expect(shouldResumeSession()).toBe(true);
    // Browser session ends — sessionStorage cleared, no persistent marker:
    sessionStorage.clear();
    expect(shouldResumeSession()).toBe(false);
  });

  it('clearSessionMarkers wipes both markers (logout)', () => {
    markLogin(true);
    clearSessionMarkers();
    expect(shouldResumeSession()).toBe(false);
  });

  it('markSessionActive keeps a resumed session alive for later reloads', () => {
    markSessionActive();
    expect(shouldResumeSession()).toBe(true);
  });
});
