/**
 * Extract plain text from an uploaded CV buffer so it can be searched and,
 * later, fed to the resume parser. Supports PDF (pdf-parse) and DOCX (mammoth).
 *
 * Image-scanned PDFs contain no selectable text — extraction returns an empty
 * string rather than throwing, so the upload still succeeds and the UI can tell
 * the recruiter "no text could be extracted" instead of crashing.
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../shared/utils/logger.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface CvTextResult {
  /** Cleaned-up extracted text. Empty string when nothing could be read. */
  text: string;
  /** True when at least some non-whitespace text was extracted. */
  hasText: boolean;
}

function clean(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// pdf-parse injects a "-- <n> of <m> --" page-separator line per page. It is not
// CV content, so strip it — otherwise an image-only PDF (no selectable text)
// would still report hasText:true and skip the filename fallback.
const PDF_PAGE_MARKER = /^[ \t]*--[ \t]*\d+[ \t]+of[ \t]+\d+[ \t]*--[ \t]*$/gm;

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? '').replace(PDF_PAGE_MARKER, '');
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}

/**
 * Best-effort text extraction. Never throws for a readable-but-empty file;
 * only unexpected parser failures are logged and downgraded to an empty result
 * so a bad file can never break the upload flow.
 */
export async function extractCvText(buffer: Buffer, mimeType: string): Promise<CvTextResult> {
  try {
    let raw = '';
    if (mimeType === PDF_MIME) {
      raw = await extractPdf(buffer);
    } else if (mimeType === DOCX_MIME) {
      raw = await extractDocx(buffer);
    } else {
      return { text: '', hasText: false };
    }

    const text = clean(raw);
    return { text, hasText: text.length > 0 };
  } catch (err) {
    // A corrupt or unsupported-internally file shouldn't fail the upload.
    logger.warn({ err, mimeType }, 'CV text extraction failed; storing without text');
    return { text: '', hasText: false };
  }
}
