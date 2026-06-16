/** Shared CV filename/MIME helpers used by every storage driver. */
import { extname } from 'node:path';

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Pick a safe stored-file extension from the original name, falling back to MIME. */
export function safeExt(originalName: string, mimeType: string): string {
  const fromName = extname(originalName).toLowerCase();
  if (fromName === '.pdf' || fromName === '.docx') return fromName;
  return EXT_BY_MIME[mimeType] ?? '';
}

/** Content-Type for a stored fileUrl, by extension. */
export function contentTypeFromUrl(fileUrl: string): string {
  return MIME_BY_EXT[extname(fileUrl).toLowerCase()] ?? 'application/octet-stream';
}
