/**
 * Resume parsing is hidden behind a small adapter so the rest of the system
 * never depends on any one LLM vendor. `getResumeParser()` returns the Haiku
 * parser when an API key is configured, and a deterministic heuristic parser
 * otherwise — the heuristic keeps local dev and integration tests working with
 * no network calls and no API key.
 *
 * Whatever a parser returns is validated against `parsedResumeSchema` before it
 * reaches the database, so a malformed or hallucinated LLM response can never
 * corrupt a candidate record.
 */

import { z } from 'zod';
import type { ParsedResume } from '@hrm/shared';

// An LLM can hallucinate a javascript:/data: URL that would become a stored-XSS
// vector once rendered as an href — only accept http(s) links from a parser.
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(255)
  .refine((v) => /^https?:\/\//i.test(v), { message: 'Only http(s) links are accepted' });

export const parsedResumeSchema = z.object({
  fullName: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(3).max(32).optional(),
  currentTitle: z.string().trim().min(1).max(150).optional(),
  totalYearsExp: z.number().min(0).max(60).optional(),
  skills: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  links: z
    .object({
      linkedin: httpUrl.optional(),
      github: httpUrl.optional(),
      portfolio: httpUrl.optional(),
    })
    .optional(),
});

export interface ResumeParser {
  /** Stored on the attachment as `parserProvider` so we know what produced a result. */
  readonly provider: string;
  /** Parse raw CV text into structured, already-validated suggestions. */
  parse(rawText: string): Promise<ParsedResume>;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Vietnamese mobile/landline or international form; tolerant of spaces/dots/dashes.
const PHONE_RE = /(?:\+?\d[\d .\-()]{7,16}\d)/;
const LINKEDIN_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s)"']+/i;
const GITHUB_RE = /https?:\/\/(?:www\.)?github\.com\/[^\s)"']+/i;
const YEARS_RE = /(\d{1,2}(?:[.,]\d)?)\s*(?:\+)?\s*(?:years?|yrs?|năm)\b/i;

const SKILL_DICTIONARY = [
  'JavaScript', 'TypeScript', 'Node.js', 'React', 'Next.js', 'Vue', 'Angular',
  'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'PHP', 'Ruby', 'Kotlin', 'Swift',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'Docker',
  'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'Express', 'NestJS',
  'Django', 'Flask', 'Spring', 'Prisma', 'Tailwind', 'HTML', 'CSS', 'SQL',
  'Kafka', 'RabbitMQ', 'Elasticsearch', 'CI/CD', 'Git', 'Linux',
];

function firstMatch(re: RegExp, text: string): string | undefined {
  const m = text.match(re);
  return m ? m[0].trim() : undefined;
}

/**
 * Heuristic, network-free parser used when no LLM key is configured. It is a
 * best-effort fallback for local dev and tests — not a substitute for the LLM
 * in production. Diacritic-bearing Vietnamese text is handled as plain UTF-8.
 */
export class HeuristicResumeParser implements ResumeParser {
  readonly provider = 'heuristic';

  async parse(rawText: string): Promise<ParsedResume> {
    const text = rawText ?? '';

    const email = firstMatch(EMAIL_RE, text);
    const phoneRaw = firstMatch(PHONE_RE, text);
    const linkedin = firstMatch(LINKEDIN_RE, text);
    const github = firstMatch(GITHUB_RE, text);

    const yearsMatch = text.match(YEARS_RE);
    const totalYearsExp = yearsMatch
      ? Number(yearsMatch[1].replace(',', '.'))
      : undefined;

    // First non-empty line is, by convention, the candidate's name on most CVs.
    const fullName = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && l.length <= 60 && !EMAIL_RE.test(l));

    const lower = text.toLowerCase();
    const skills = SKILL_DICTIONARY.filter((s) =>
      lower.includes(s.toLowerCase())
    );

    const links =
      linkedin || github ? { linkedin, github } : undefined;

    return parsedResumeSchema.parse({
      fullName,
      email,
      phone: phoneRaw,
      totalYearsExp,
      skills,
      links,
    });
  }
}

let cachedParser: ResumeParser | null = null;

/**
 * Pick the parser implementation. Lazily imports the Haiku adapter only when an
 * API key is present, so the SDK is never loaded in test/dev environments.
 */
export async function getResumeParser(): Promise<ResumeParser> {
  if (cachedParser) return cachedParser;

  if (process.env.ANTHROPIC_API_KEY) {
    const { HaikuResumeParser } = await import('./haiku-resume-parser.js');
    cachedParser = new HaikuResumeParser();
  } else {
    cachedParser = new HeuristicResumeParser();
  }
  return cachedParser;
}

/** Test seam: reset the memoized parser between cases. */
export function resetResumeParserCache(): void {
  cachedParser = null;
}
