import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { CustomerType, LeadSource } from '@prisma/client';

export type ImportFileFormat = 'xlsx' | 'csv';

// Header labels (Vietnamese) → field. Header match is case-insensitive + accent-loose enough
// for the labels we ship in the template.
const COLUMNS = [
  { field: 'type', label: 'Loại' },
  { field: 'fullName', label: 'Họ tên' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Số điện thoại' },
  { field: 'title', label: 'Chức danh' },
  { field: 'source', label: 'Nguồn' },
  { field: 'address', label: 'Địa chỉ' },
] as const;

export interface ParsedImportRow {
  rowNumber: number;
  type: CustomerType;
  fullName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: LeadSource | null;
  address: string | null;
  error?: string;
}

function normType(raw: string): CustomerType {
  const v = raw.trim().toUpperCase();
  if (v === 'B2B' || v.includes('DOANH')) return CustomerType.B2B;
  return CustomerType.B2C;
}

function normSource(raw: string): LeadSource | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return (Object.values(LeadSource) as string[]).includes(v) ? (v as LeadSource) : null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text ?? '').trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
}

/** Parse an uploaded xlsx/csv into customer rows. Header row drives column mapping. */
export async function parseCustomerImport(buffer: Buffer, format: ImportFileFormat): Promise<ParsedImportRow[]> {
  const wb = new ExcelJS.Workbook();
  if (format === 'csv') await wb.csv.read(Readable.from(buffer));
  else await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  // Map header label → column index from the first row.
  const headerRow = ws.getRow(1);
  const colByField = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const label = cellText(cell.value).toLowerCase();
    const match = COLUMNS.find((c) => c.label.toLowerCase() === label);
    if (match) colByField.set(match.field, colNumber);
  });

  const rows: ParsedImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (field: string) => {
      const col = colByField.get(field);
      return col ? cellText(row.getCell(col).value) : '';
    };
    const fullName = get('fullName');
    // Skip fully empty rows.
    if (!fullName && !get('email') && !get('phone')) continue;

    const parsed: ParsedImportRow = {
      rowNumber: r,
      type: normType(get('type')),
      fullName,
      email: get('email') || null,
      phone: get('phone') || null,
      title: get('title') || null,
      source: normSource(get('source')),
      address: get('address') || null,
    };
    if (!fullName) parsed.error = 'Thiếu họ tên';
    rows.push(parsed);
  }
  return rows;
}

/** Build a blank import template (headers + one example row). */
export async function buildImportTemplate(format: ImportFileFormat): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Khách hàng');
  ws.addRow(COLUMNS.map((c) => c.label));
  ws.addRow(['B2C', 'Nguyễn Văn A', 'a@example.com', '0901234567', 'Giám đốc', 'WEB', 'Hà Nội']);
  ws.getRow(1).font = { bold: true };
  if (format === 'csv') {
    const buf = await wb.csv.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
