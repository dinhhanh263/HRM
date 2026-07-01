import ExcelJS from 'exceljs';
import {
  CASH_TX_IMPORT_COLUMNS,
  REQUIRED_CASH_TX_IMPORT_COLUMNS,
  type CashTxImportColumn,
  type CashTxImportLang,
} from '@hrm/shared';
import { CASH_TX_COLUMN_LABELS, type ImportFileFormat } from './cash-transaction-import.parser.js';

export interface TemplateFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// Example rows show the expected shape. Account/category/department are matched by
// NAME (must already exist in the tenant); direction is Thu|Chi / IN|OUT.
const EXAMPLE_ROWS: Record<CashTxImportLang, Record<CashTxImportColumn, string>[]> = {
  vi: [
    { account: 'Vietcombank - CodeCrush', direction: 'Thu', amount: '30000000', date: '2026-07-01', category: 'Ecom / Bán hàng', department: '', reference: 'CK-001', description: 'Doanh thu Shopee' },
    { account: 'Vietcombank - CodeCrush', direction: 'Chi', amount: '8000000', date: '2026-07-02', category: 'Ads / Quảng cáo', department: 'Marketing', reference: '', description: 'Facebook Ads' },
  ],
  en: [
    { account: 'Vietcombank - CodeCrush', direction: 'In', amount: '30000000', date: '2026-07-01', category: 'Ecom / Sales', department: '', reference: 'TR-001', description: 'Shopee revenue' },
    { account: 'Vietcombank - CodeCrush', direction: 'Out', amount: '8000000', date: '2026-07-02', category: 'Ads', department: 'Marketing', reference: '', description: 'Facebook Ads' },
  ],
};

const STRINGS: Record<CashTxImportLang, { sheet: string; guide: string; filename: string; notes: string[] }> = {
  vi: {
    sheet: 'Giao dịch',
    guide: 'Hướng dẫn',
    filename: 'mau-nhap-giao-dich',
    notes: [
      'Bắt buộc: Tài khoản, Loại (Thu/Chi), Số tiền, Ngày.',
      'Tài khoản / Danh mục / Bộ phận khớp theo TÊN — phải tồn tại sẵn trong hệ thống.',
      'Loại: nhập "Thu" hoặc "Chi" (chấp nhận IN/OUT).',
      'Số tiền: số > 0, VND, không dùng dấu phân cách nghìn (ví dụ 8000000).',
      'Ngày: định dạng YYYY-MM-DD (ví dụ 2026-07-02).',
      'Không sửa dòng tiêu đề. Xoá 2 dòng ví dụ trước khi nhập dữ liệu thật.',
    ],
  },
  en: {
    sheet: 'Transactions',
    guide: 'Guide',
    filename: 'cash-transaction-import-template',
    notes: [
      'Required: Account, Direction (In/Out), Amount, Date.',
      'Account / Category / Department are matched by NAME — they must already exist.',
      'Direction: enter "In" or "Out" (Thu/Chi accepted).',
      'Amount: a number > 0 in VND, no thousands separators (e.g. 8000000).',
      'Date: YYYY-MM-DD (e.g. 2026-07-02).',
      'Do not edit the header row. Delete the 2 example rows before importing.',
    ],
  },
};

function headerFor(col: CashTxImportColumn, lang: CashTxImportLang): string {
  const label = CASH_TX_COLUMN_LABELS[col][lang];
  return REQUIRED_CASH_TX_IMPORT_COLUMNS.includes(col) ? `${label} *` : label;
}

function buildCsv(lang: CashTxImportLang): Buffer {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [CASH_TX_IMPORT_COLUMNS.map((c) => escape(headerFor(c, lang))).join(',')];
  for (const ex of EXAMPLE_ROWS[lang]) {
    lines.push(CASH_TX_IMPORT_COLUMNS.map((c) => escape(ex[c])).join(','));
  }
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

async function buildXlsx(lang: CashTxImportLang): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const strings = STRINGS[lang];
  const sheet = workbook.addWorksheet(strings.sheet);
  sheet.columns = CASH_TX_IMPORT_COLUMNS.map((col) => ({
    header: headerFor(col, lang),
    key: col,
    width: Math.max(16, headerFor(col, lang).length + 4),
  }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 20;
  for (const ex of EXAMPLE_ROWS[lang]) sheet.addRow(ex);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const guide = workbook.addWorksheet(strings.guide);
  guide.getColumn(1).width = 100;
  guide.getCell('A1').value = strings.guide;
  guide.getCell('A1').font = { bold: true, size: 14 };
  strings.notes.forEach((note, i) => {
    guide.getCell(`A${i + 3}`).value = `• ${note}`;
    guide.getCell(`A${i + 3}`).alignment = { wrapText: true };
  });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

const CONTENT_TYPES: Record<ImportFileFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

export async function buildCashTxImportTemplate(
  format: ImportFileFormat,
  lang: CashTxImportLang,
): Promise<TemplateFile> {
  const buffer = format === 'csv' ? buildCsv(lang) : await buildXlsx(lang);
  return {
    buffer,
    filename: `${STRINGS[lang].filename}.${format}`,
    contentType: CONTENT_TYPES[format],
  };
}
