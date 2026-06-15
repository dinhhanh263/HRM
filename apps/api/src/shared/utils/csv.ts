// RFC 4180 CSV serialisation. A field is quoted only when it contains a quote,
// comma, or line break; embedded quotes are doubled.
function escapeField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

type CsvCell = string | number | null | undefined;

// Build a UTF-8 CSV string with a leading BOM so Excel renders Vietnamese
// headers without mojibake. Rows are CRLF-terminated.
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
