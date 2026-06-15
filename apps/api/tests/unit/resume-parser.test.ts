import { describe, it, expect } from 'vitest';
import {
  HeuristicResumeParser,
  parsedResumeSchema,
} from '../../src/domain/recruitment/resume-parser.js';

// A realistic Vietnamese CV sample with diacritics, contact details, and skills.
const CV_FIXTURE = `Nguyễn Văn Tuyển
Senior Backend Engineer
Email: tuyen.nguyen@example.com
Phone: 0912 345 678
LinkedIn: https://www.linkedin.com/in/tuyennguyen
GitHub: https://github.com/tuyennguyen

Kinh nghiệm: 8 năm phát triển hệ thống backend.
Kỹ năng: Node.js, TypeScript, PostgreSQL, Redis, Docker, Kubernetes.
`;

describe('HeuristicResumeParser', () => {
  const parser = new HeuristicResumeParser();

  it('maps email, phone, links, years of experience and skills from raw text', async () => {
    const result = await parser.parse(CV_FIXTURE);

    expect(result.email).toBe('tuyen.nguyen@example.com');
    expect(result.phone).toContain('0912');
    expect(result.totalYearsExp).toBe(8);
    expect(result.links?.linkedin).toContain('linkedin.com/in/tuyennguyen');
    expect(result.links?.github).toContain('github.com/tuyennguyen');
    // Skills are matched case-insensitively against the dictionary.
    expect(result.skills).toEqual(
      expect.arrayContaining(['Node.js', 'TypeScript', 'PostgreSQL', 'Redis'])
    );
  });

  it('preserves Vietnamese diacritics in the extracted full name', async () => {
    const result = await parser.parse(CV_FIXTURE);
    expect(result.fullName).toBe('Nguyễn Văn Tuyển');
  });

  it('returns an empty, schema-valid suggestion for blank text (scanned image)', async () => {
    const result = await parser.parse('');
    expect(result.skills).toEqual([]);
    expect(result.email).toBeUndefined();
  });

  it('always returns a value that satisfies the shared Zod schema', async () => {
    const result = await parser.parse(CV_FIXTURE);
    // parse() throws if the result is malformed — proves output is validated.
    expect(() => parsedResumeSchema.parse(result)).not.toThrow();
  });
});

describe('parsedResumeSchema', () => {
  it('strips unknown keys and rejects an invalid email', () => {
    const cleaned = parsedResumeSchema.parse({
      email: 'a@b.com',
      skills: ['Go'],
      junk: 'ignore me',
    } as Record<string, unknown>);
    expect(cleaned).not.toHaveProperty('junk');

    expect(() =>
      parsedResumeSchema.parse({ email: 'not-an-email', skills: [] })
    ).toThrow();
  });

  it('defaults skills to an empty array when omitted', () => {
    const cleaned = parsedResumeSchema.parse({});
    expect(cleaned.skills).toEqual([]);
  });

  it('rejects a non-http(s) link (javascript: XSS vector) from a parser', () => {
    expect(() =>
      parsedResumeSchema.parse({ skills: [], links: { linkedin: 'javascript:alert(1)' } })
    ).toThrow();
    expect(() =>
      parsedResumeSchema.parse({ skills: [], links: { portfolio: 'https://me.dev' } })
    ).not.toThrow();
  });
});
