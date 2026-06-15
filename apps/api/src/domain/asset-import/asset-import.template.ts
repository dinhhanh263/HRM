import ExcelJS from 'exceljs';
import {
  ASSET_IMPORT_COLUMNS,
  ASSET_IMPORT_COLUMN_LABELS,
  ASSET_IMPORT_ENUM_OPTIONS,
  REQUIRED_ASSET_IMPORT_COLUMNS,
  type AssetImportColumn,
  type ImportLang,
} from '@hrm/shared';
import type { ImportFileFormat } from './asset-import.parser.js';

export interface TemplateFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Two example rows so HR sees the expected shape (dates as YYYY-MM-DD, condition
 *  as the exact uppercase code, category referenced by its code, owner by email). */
const EXAMPLE_ROWS: Record<AssetImportColumn, string>[] = [
  {
    assetCode: 'LAPTOP-001',
    name: 'MacBook Pro 14"',
    category: 'IT',
    serialNumber: 'C02XYZ123',
    brand: 'Apple',
    model: 'M3 Pro',
    condition: 'NEW',
    purchaseDate: '2024-01-06',
    purchaseCost: '45000000',
    warrantyEndDate: '2027-01-06',
    vendor: 'FPT Shop',
    location: 'HCM HQ - Tầng 3',
    note: '',
    owner: '',
    assignedAt: '',
  },
  {
    assetCode: 'CHAIR-001',
    name: 'Ghế công thái học',
    category: 'FURNITURE',
    serialNumber: '',
    brand: 'Herman Miller',
    model: 'Aeron',
    condition: 'GOOD',
    purchaseDate: '2023-09-01',
    purchaseCost: '12000000',
    warrantyEndDate: '',
    vendor: 'Office Pro',
    location: 'HCM HQ - Tầng 2',
    note: 'Cấp cho nhân viên mới',
    owner: 'an.nguyen@example.com',
    assignedAt: '2023-09-05',
  },
];

/** Which columns expose a dropdown of allowed values (the enum columns). */
const ENUM_COLUMNS = Object.keys(ASSET_IMPORT_ENUM_OPTIONS) as (keyof typeof ASSET_IMPORT_ENUM_OPTIONS)[];

/** Localized strings used in the .xlsx guidance sheet and filename. */
const STRINGS: Record<ImportLang, {
  sheet: string;
  guide: string;
  filename: string;
  notes: string[];
}> = {
  vi: {
    sheet: 'Tài sản',
    guide: 'Hướng dẫn',
    filename: 'mau-nhap-tai-san',
    notes: [
      'Bắt buộc: Mã tài sản, Tên tài sản, Mã loại. Các cột còn lại có thể để trống.',
      'Mã tài sản: chữ HOA, số, gạch ngang hoặc gạch dưới (ví dụ LAPTOP-001), không trùng nhau.',
      'Mã loại: nhập đúng mã loại tài sản đã tạo trong hệ thống — loại chưa tồn tại sẽ báo lỗi.',
      'Ngày (Ngày mua, Hết bảo hành, Ngày cấp phát) định dạng YYYY-MM-DD, ví dụ 2024-01-06.',
      'Tình trạng: NEW / GOOD / FAIR / POOR (có thể để trống).',
      'Nguyên giá: số nguyên VND, không dấu phân cách (ví dụ 45000000).',
      'Người sở hữu: Email hoặc Mã nhân viên — nếu có thì BẮT BUỘC nhập Ngày cấp phát.',
      'Không sửa dòng tiêu đề. Xoá 2 dòng ví dụ trước khi nhập dữ liệu thật.',
    ],
  },
  en: {
    sheet: 'Assets',
    guide: 'Guide',
    filename: 'asset-import-template',
    notes: [
      'Required: Asset code, Asset name, Category code. All other columns are optional.',
      'Asset code: uppercase letters, digits, hyphen or underscore (e.g. LAPTOP-001), must be unique.',
      'Category code: must match a category code already created in the system — unknown codes error.',
      'Dates (Purchase date, Warranty end date, Assigned date) use YYYY-MM-DD, e.g. 2024-01-06.',
      'Condition: NEW / GOOD / FAIR / POOR (may be left blank).',
      'Purchase cost: integer VND, no thousands separators (e.g. 45000000).',
      'Owner: Email or Employee code — if set, Assigned date is REQUIRED.',
      'Do not edit the header row. Delete the 2 example rows before importing real data.',
    ],
  },
};

function headerFor(col: AssetImportColumn, lang: ImportLang): string {
  const label = ASSET_IMPORT_COLUMN_LABELS[col][lang];
  // Mark required columns with an asterisk for quick visual scanning.
  const required: readonly string[] = REQUIRED_ASSET_IMPORT_COLUMNS;
  return required.includes(col) ? `${label} *` : label;
}

/** Build the .csv variant: header row + example rows, comma-separated. */
function buildCsv(lang: ImportLang): Buffer {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = ASSET_IMPORT_COLUMNS.map((col) => escape(headerFor(col, lang)));
  const lines = [header.join(',')];
  for (const example of EXAMPLE_ROWS) {
    lines.push(ASSET_IMPORT_COLUMNS.map((col) => escape(example[col])).join(','));
  }
  // Prepend a UTF-8 BOM so Excel opens Vietnamese headers without mojibake.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

/** Build the .xlsx variant: styled header, example rows, dropdowns on enum
 *  columns, plus a second guidance sheet. */
async function buildXlsx(lang: ImportLang): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const strings = STRINGS[lang];
  const sheet = workbook.addWorksheet(strings.sheet);

  // Header row.
  sheet.columns = ASSET_IMPORT_COLUMNS.map((col) => ({
    header: headerFor(col, lang),
    key: col,
    width: Math.max(16, headerFor(col, lang).length + 4),
  }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  // Example rows.
  for (const example of EXAMPLE_ROWS) {
    sheet.addRow(example);
  }

  // Dropdown data-validation on enum columns, applied to a generous row range
  // so it covers data the user pastes in below the examples.
  const VALIDATION_LAST_ROW = 1000;
  for (const col of ENUM_COLUMNS) {
    const colIndex = ASSET_IMPORT_COLUMNS.indexOf(col) + 1;
    const options = ASSET_IMPORT_ENUM_OPTIONS[col];
    const letter = sheet.getColumn(colIndex).letter;
    for (let r = 2; r <= VALIDATION_LAST_ROW; r++) {
      sheet.getCell(`${letter}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${options.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        error: options.join(' / '),
      };
    }
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Guidance sheet.
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
 * Build a downloadable asset-import template in the requested format and
 * language. Headers come from the shared `ASSET_IMPORT_COLUMN_LABELS` so they
 * always match what the parser accepts; .xlsx additionally carries a dropdown
 * for the condition column and a guidance sheet.
 */
export async function buildAssetImportTemplate(
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
