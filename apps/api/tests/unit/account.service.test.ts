import { describe, it, expect } from 'vitest';
import { describeUserAgent } from '../../src/domain/services/account.service.js';

// SPEC-037 — best-effort device label; order matters (Edge UA contains Chrome).
describe('describeUserAgent', () => {
  it('labels common desktop browsers with their OS', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · macOS');
    expect(
      describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'),
    ).toBe('Firefox · Windows');
  });

  it('recognises Edge before Chrome (Edge UA contains "Chrome")', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      ),
    ).toBe('Edge · Windows');
  });

  it('labels mobile systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
  });

  it('returns null for empty or unrecognisable agents', () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent('curl/8.6.0')).toBeNull();
  });
});
