import ExcelJS from 'exceljs';
import {
  IMPORT_COLUMNS,
  IMPORT_COLUMN_LABELS,
  IMPORT_ENUM_OPTIONS,
  REQUIRED_IMPORT_COLUMNS,
  type ImportColumn,
  type ImportLang,
} from '@hrm/shared';
import type { ImportFileFormat } from './employee-import.parser.js';

export interface TemplateFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Two example rows so HR sees the expected shape (dates as YYYY-MM-DD,
 *  enums as the exact uppercase codes, manager referenced by email). */
const EXAMPLE_ROWS: Record<ImportColumn, string>[] = [
  {
    fullName: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    dateOfBirth: '1992-03-15',
    gender: 'MALE',
    idNumber: '012345678901',
    phone: '0901234567',
    department: 'Engineering',
    position: 'Senior Developer',
    manager: '',
    joinDate: '2024-01-06',
    contractType: 'FULL_TIME',
    dependentsCount: '2',
    role: 'EMPLOYEE',
  },
  {
    fullName: 'Trần Thị Bình',
    email: 'binh.tran@example.com',
    dateOfBirth: '1990-07-22',
    gender: 'FEMALE',
    idNumber: '098765432109',
    phone: '0907654321',
    department: 'Engineering',
    position: 'Engineering Manager',
    manager: 'an.nguyen@example.com',
    joinDate: '2023-09-01',
    contractType: 'FULL_TIME',
    dependentsCount: '0',
    role: 'MANAGER',
  },
];

/** Which columns expose a dropdown of allowed values (the enum columns). */
const ENUM_COLUMNS = Object.keys(IMPORT_ENUM_OPTIONS) as (keyof typeof IMPORT_ENUM_OPTIONS)[];

/** Localized strings used in the .xlsx guidance sheet and filename. */
const STRINGS: Record<ImportLang, {
  sheet: string;
  guide: string;
  filename: string;
  notes: string[];
}> = {
  vi: {
    sheet: 'Nhân viên',
    guide: 'Hướng dẫn',
    filename: 'mau-nhap-nhan-vien',
    notes: [
      'Bắt buộc: Họ và tên, Email. Các cột còn lại có thể để trống.',
      'Ngày (Ngày sinh, Ngày vào làm) định dạng YYYY-MM-DD, ví dụ 2024-01-06.',
      'Giới tính: MALE / FEMALE / OTHER.',
      'Loại hợp đồng: FULL_TIME / PART_TIME / CONTRACT / INTERN / PROBATION (mặc định FULL_TIME).',
      'Vai trò: EMPLOYEE / MANAGER / HR_MANAGER (mặc định EMPLOYEE).',
      'Số người phụ thuộc: số nguyên 0–20 (mặc định 0) — dùng để tính giảm trừ thuế TNCN.',
      'Quản lý: nhập Email của quản lý (có thể là người ở dòng khác trong cùng file).',
      'Không sửa dòng tiêu đề. Xoá 2 dòng ví dụ trước khi nhập dữ liệu thật.',
    ],
  },
  en: {
    sheet: 'Employees',
    guide: 'Guide',
    filename: 'employee-import-template',
    notes: [
      'Required: Full name, Email. All other columns are optional.',
      'Dates (Date of birth, Join date) use YYYY-MM-DD, e.g. 2024-01-06.',
      'Gender: MALE / FEMALE / OTHER.',
      'Contract type: FULL_TIME / PART_TIME / CONTRACT / INTERN / PROBATION (defaults to FULL_TIME).',
      'Role: EMPLOYEE / MANAGER / HR_MANAGER (defaults to EMPLOYEE).',
      'Dependents: integer 0–20 (defaults to 0) — used for the PIT dependent deduction.',
      'Manager: enter the manager\'s Email (may be someone on another row in the same file).',
      'Do not edit the header row. Delete the 2 example rows before importing real data.',
    ],
  },
};

function headerFor(col: ImportColumn, lang: ImportLang): string {
  const label = IMPORT_COLUMN_LABELS[col][lang];
  // Mark required columns with an asterisk for quick visual scanning.
  const required: readonly string[] = REQUIRED_IMPORT_COLUMNS;
  return required.includes(col) ? `${label} *` : label;
}

/** Build the .csv variant: header row + example rows, comma-separated. */
function buildCsv(lang: ImportLang): Buffer {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = IMPORT_COLUMNS.map((col) => escape(headerFor(col, lang)));
  const lines = [header.join(',')];
  for (const example of EXAMPLE_ROWS) {
    lines.push(IMPORT_COLUMNS.map((col) => escape(example[col])).join(','));
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
  sheet.columns = IMPORT_COLUMNS.map((col) => ({
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
    const colIndex = IMPORT_COLUMNS.indexOf(col) + 1;
    const options = IMPORT_ENUM_OPTIONS[col];
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
  guide.getColumn(1).width = 90;
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
 * Build a downloadable import template in the requested format and language.
 * Headers come from the shared `IMPORT_COLUMN_LABELS` so they always match what
 * the parser accepts; .xlsx additionally carries dropdowns for the enum columns
 * and a guidance sheet.
 */
export async function buildImportTemplate(
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
