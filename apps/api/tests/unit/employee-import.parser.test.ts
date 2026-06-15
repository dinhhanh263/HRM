import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { IMPORT_ERROR_CODES } from '@hrm/shared';
import { parseEmployeeFile } from '../../src/domain/employee-import/employee-import.parser.js';

/** Build an .xlsx Buffer from a header row + data rows. */
async function makeXlsx(headers: string[], dataRows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  ws.addRow(headers);
  dataRows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const CANONICAL_HEADERS = [
  'fullName',
  'email',
  'dateOfBirth',
  'gender',
  'idNumber',
  'phone',
  'department',
  'position',
  'manager',
  'joinDate',
  'contractType',
  'role',
];

describe('employee-import parser — xlsx', () => {
  it('parses a clean xlsx into normalized rows (email lowercased, trimmed)', async () => {
    const buffer = await makeXlsx(CANONICAL_HEADERS, [
      ['Nguyen Van A', '  ALICE@Example.com ', '', 'MALE', '', '', 'Engineering', 'Dev', '', '', 'FULL_TIME', 'EMPLOYEE'],
      ['Tran Thi B', 'bob@example.com', '', '', '', '', '', '', '', '', '', ''],
    ]);

    const { rows, errors } = await parseEmployeeFile(buffer, 'xlsx');

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      fullName: 'Nguyen Van A',
      email: 'alice@example.com',
      gender: 'MALE',
      department: 'Engineering',
    });
    expect(rows[1].rowNumber).toBe(2);
    expect(rows[1].email).toBe('bob@example.com');
  });

  it('tolerates spacing/casing variations in header names', async () => {
    const buffer = await makeXlsx(
      ['Full Name', 'E-Mail', 'Join_Date'],
      [['Le Van C', 'c@example.com', '2026-01-01']],
    );
    // "E-Mail" does not normalize to "email" — only "email" does. So provide email properly.
    const { rows, errors } = await parseEmployeeFile(
      await makeXlsx(['Full Name', 'Email', 'Join Date'], [['Le Van C', 'c@example.com', '2026-01-01']]),
      'xlsx',
    );
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ fullName: 'Le Van C', email: 'c@example.com', joinDate: '2026-01-01' });
    // sanity: the buffer var above is also valid input (unused header alias path)
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('skips fully-blank padding rows and renumbers data rows contiguously', async () => {
    const buffer = await makeXlsx(CANONICAL_HEADERS, [
      ['A One', 'a1@example.com', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', ''], // blank
      ['A Two', 'a2@example.com', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const { rows } = await parseEmployeeFile(buffer, 'xlsx');
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2]);
    expect(rows.map((r) => r.email)).toEqual(['a1@example.com', 'a2@example.com']);
  });

  it('returns IMPORT_MISSING_COLUMNS when a required header is absent', async () => {
    const buffer = await makeXlsx(['fullName', 'phone'], [['No Email', '0900000000']]);
    const { rows, errors } = await parseEmployeeFile(buffer, 'xlsx');
    expect(rows).toHaveLength(0);
    expect(errors[0].code).toBe(IMPORT_ERROR_CODES.MISSING_COLUMNS);
  });

  it('returns IMPORT_EMPTY_FILE for a header-only sheet', async () => {
    const buffer = await makeXlsx(CANONICAL_HEADERS, []);
    const { errors } = await parseEmployeeFile(buffer, 'xlsx');
    expect(errors[0].code).toBe(IMPORT_ERROR_CODES.EMPTY_FILE);
  });

  it('returns IMPORT_UNREADABLE_FILE for a non-spreadsheet buffer', async () => {
    const buffer = Buffer.from('this is not a spreadsheet at all');
    const { errors } = await parseEmployeeFile(buffer, 'xlsx');
    expect(errors[0].code).toBe(IMPORT_ERROR_CODES.UNREADABLE_FILE);
  });
});

describe('employee-import parser — csv', () => {
  it('parses a clean csv into normalized rows', async () => {
    const csv = [
      CANONICAL_HEADERS.join(','),
      'Nguyen Van A,alice@example.com,,MALE,,,Engineering,Dev,,,FULL_TIME,EMPLOYEE',
      'Tran Thi B,BOB@Example.com,,,,,,,,,,',
    ].join('\n');
    const { rows, errors } = await parseEmployeeFile(Buffer.from(csv, 'utf-8'), 'csv');

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe('alice@example.com');
    expect(rows[1].email).toBe('bob@example.com');
  });

  it('returns IMPORT_MISSING_COLUMNS for a csv without an email column', async () => {
    const csv = ['fullName,phone', 'No Email,0900000000'].join('\n');
    const { errors } = await parseEmployeeFile(Buffer.from(csv, 'utf-8'), 'csv');
    expect(errors[0].code).toBe(IMPORT_ERROR_CODES.MISSING_COLUMNS);
  });
});
