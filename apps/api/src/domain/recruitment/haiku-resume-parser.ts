/**
 * Claude Haiku implementation of the ResumeParser adapter. It asks the model to
 * return a strict JSON object, then validates that object with the shared Zod
 * schema before handing it back — the LLM output is never trusted directly.
 *
 * Privacy: only the extracted CV text is sent to the API, and nothing from the
 * CV (no names, emails, phone numbers) is ever logged. On any failure we throw
 * so the worker can mark the attachment FAILED and let the recruiter re-parse.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ParsedResume } from '@hrm/shared';
import { logger } from '../../shared/utils/logger.js';
import { parsedResumeSchema, type ResumeParser } from './resume-parser.js';

const MODEL = process.env.ANTHROPIC_RESUME_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TEXT_CHARS = 24_000;

const SYSTEM_PROMPT = `You extract structured data from a candidate's CV.
Return ONLY a JSON object — no prose, no markdown fences — with this shape:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "currentTitle": string,
  "totalYearsExp": number,
  "skills": string[],
  "links": { "linkedin": string, "github": string, "portfolio": string }
}
Rules:
- Omit any field you cannot determine; never invent values.
- The CV may be in Vietnamese (with diacritics) or English — preserve the
  original spelling and diacritics exactly.
- "totalYearsExp" is the candidate's total years of professional experience as a number.
- "skills" is a deduplicated list of concrete technologies/tools.`;

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // The model occasionally wraps JSON in a fenced block despite instructions.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export class HaikuResumeParser implements ResumeParser {
  readonly provider = 'haiku';
  private readonly client: Anthropic;

  constructor() {
    // Throws if the key is missing — guarded by getResumeParser().
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async parse(rawText: string): Promise<ParsedResume> {
    const text = (rawText ?? '').slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) {
      // No text to parse (e.g. scanned image) — return an empty suggestion.
      return parsedResumeSchema.parse({ skills: [] });
    }

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      throw new Error('Resume parser returned no text content');
    }

    let json: unknown;
    try {
      json = extractJson(block.text);
    } catch {
      // Don't log block.text — it can echo PII from the CV.
      throw new Error('Resume parser returned non-JSON output');
    }

    // Zod strips unknown keys and enforces types; a bad shape throws here.
    const parsed = parsedResumeSchema.parse(json);
    logger.info(
      { provider: this.provider, model: MODEL, skillsCount: parsed.skills.length },
      'CV parsed via Haiku'
    );
    return parsed;
  }
}
