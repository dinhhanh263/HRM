import ExcelJS from 'exceljs';
import {
  PR_ITEM_IMPORT_COLUMNS,
  PR_ITEM_IMPORT_COLUMN_LABELS,
  REQUIRED_PR_ITEM_IMPORT_COLUMNS,
  type PRItemImportColumn,
  type ImportLang,
} from '@hrm/shared';
import type { ImportFileFormat } from './purchase-request-import.parser.js';

export interface TemplateFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Two example rows so the user sees the expected shape (plain numbers, no
 *  thousands separators; blank tax defaults to 8%). */
const EXAMPLE_ROWS: Record<PRItemImportColumn, string>[] = [
  {
    productName: 'Laptop Dell Latitude 5540',
    sku: 'DELL-5540',
    unit: 'cái',
    quantity: '2',
    unitPrice: '22000000',
    taxRate: '8',
  },
  {
    productName: 'Chuột không dây Logitech',
    sku: '',
    unit: 'cái',
    quantity: '5',
    unitPrice: '350000',
    taxRate: '',
  },
];

/** Localized strings used in the .xlsx guidance sheet and filename. */
const STRINGS: Record<ImportLang, { sheet: string; guide: string; filename: string; notes: string[] }> = {
  vi: {
    sheet: 'Dòng hàng',
    guide: 'Hướng dẫn',
    filename: 'mau-nhap-dong-hang',
    notes: [
      'Bắt buộc: Tên sản phẩm, Số lượng, Đơn giá. Mã SKU, Đơn vị, Thuế có thể để trống.',
      'Số lượng: số > 0 (cho phép số lẻ, ví dụ 1.5).',
      'Đơn giá: số ≥ 0, VND, không dùng dấu phân cách nghìn (ví dụ 22000000). Dấu phẩy nếu có sẽ được bỏ.',
      'Thuế (%): từ 0 đến 100. Để trống sẽ mặc định 8%.',
      'Dữ liệu import chỉ được thêm vào biểu mẫu — bạn vẫn cần nhập thông tin phiếu và bấm Tạo phiếu.',
      'Không sửa dòng tiêu đề. Xoá 2 dòng ví dụ trước khi nhập dữ liệu thật.',
    ],
  },
  en: {
    sheet: 'Line items',
    guide: 'Guide',
    filename: 'purchase-item-import-template',
    notes: [
      'Required: Product name, Quantity, Unit price. SKU, Unit and Tax may be blank.',
      'Quantity: a number > 0 (decimals allowed, e.g. 1.5).',
      'Unit price: a number ≥ 0 in VND, no thousands separators (e.g. 22000000). Commas, if present, are stripped.',
      'Tax rate (%): between 0 and 100. Left blank defaults to 8%.',
      'Imported rows are only added to the form — you still enter the request details and click Create.',
      'Do not edit the header row. Delete the 2 example rows before importing real data.',
    ],
  },
};

function headerFor(col: PRItemImportColumn, lang: ImportLang): string {
  const label = PR_ITEM_IMPORT_COLUMN_LABELS[col][lang];
  const required: readonly string[] = REQUIRED_PR_ITEM_IMPORT_COLUMNS;
  return required.includes(col) ? `${label} *` : label;
}

/** Build the .csv variant: header row + example rows, comma-separated. */
function buildCsv(lang: ImportLang): Buffer {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = PR_ITEM_IMPORT_COLUMNS.map((col) => escape(headerFor(col, lang)));
  const lines = [header.join(',')];
  for (const example of EXAMPLE_ROWS) {
    lines.push(PR_ITEM_IMPORT_COLUMNS.map((col) => escape(example[col])).join(','));
  }
  // Prepend a UTF-8 BOM so Excel opens Vietnamese headers without mojibake.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

/** Build the .xlsx variant: styled header, example rows, plus a guidance sheet. */
async function buildXlsx(lang: ImportLang): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const strings = STRINGS[lang];
  const sheet = workbook.addWorksheet(strings.sheet);

  sheet.columns = PR_ITEM_IMPORT_COLUMNS.map((col) => ({
    header: headerFor(col, lang),
    key: col,
    width: Math.max(16, headerFor(col, lang).length + 4),
  }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  for (const example of EXAMPLE_ROWS) {
    sheet.addRow(example);
  }

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

/**
 * Build a downloadable line-item import template in the requested format and
 * language. Headers come from the shared `PR_ITEM_IMPORT_COLUMN_LABELS` so they
 * always match what the parser accepts.
 */
export async function buildPRItemImportTemplate(
  format: ImportFileFormat,
  lang: ImportLang,
): Promise<TemplateFile> {
  const buffer = format === 'csv' ? buildCsv(lang) : await buildXlsx(lang);
  return {
    buffer,
    filename: `${STRINGS[lang].filename}.${format}`,
    contentType: CONTENT_TYPES[format],
  };
}
