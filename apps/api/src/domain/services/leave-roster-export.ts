import ExcelJS from 'exceljs';
import type { LeaveBalanceRosterRowDto, LeaveTypeSummaryDto } from '@hrm/shared';

/**
 * Render the company-wide leave balance roster as an .xlsx workbook. The layout
 * mirrors the on-screen table: a frozen identity block (employee / code /
 * department) followed by three sub-columns per leave type — remaining, used,
 * pending — so HR can scan the same numbers they see in the UI.
 */
export async function buildRosterWorkbook(
  rows: LeaveBalanceRosterRowDto[],
  leaveTypes: LeaveTypeSummaryDto[],
  year: number,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Số dư phép ${year}`);

  // Two header rows: leave-type group spanning 3 columns, then the sub-labels.
  const IDENTITY_COLS = 3;
  const SUBCOLS = ['Còn lại', 'Đã dùng', 'Chờ duyệt'];

  const topHeader: (string | null)[] = ['Nhân viên', 'Mã NV', 'Phòng ban'];
  const subHeader: string[] = ['', '', ''];
  for (const lt of leaveTypes) {
    topHeader.push(lt.name, null, null);
    subHeader.push(...SUBCOLS);
  }

  sheet.addRow(topHeader);
  sheet.addRow(subHeader);

  // Merge identity headers vertically and each leave-type label across its 3 cols.
  for (let c = 1; c <= IDENTITY_COLS; c++) {
    sheet.mergeCells(1, c, 2, c);
  }
  leaveTypes.forEach((_, i) => {
    const start = IDENTITY_COLS + 1 + i * SUBCOLS.length;
    sheet.mergeCells(1, start, 1, start + SUBCOLS.length - 1);
  });

  for (const rowNum of [1, 2]) {
    const row = sheet.getRow(rowNum);
    row.font = { bold: true };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  for (const { employee, balances } of rows) {
    const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));
    const values: (string | number)[] = [
      employee.fullName,
      employee.employeeCode ?? '',
      employee.departmentName ?? '',
    ];
    for (const lt of leaveTypes) {
      const b = byType.get(lt.id);
      values.push(b?.remaining ?? 0, b?.used ?? 0, b?.pending ?? 0);
    }
    sheet.addRow(values);
  }

  // Column widths: wide identity columns, compact numeric columns.
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 20;
  for (let c = IDENTITY_COLS + 1; c <= IDENTITY_COLS + leaveTypes.length * SUBCOLS.length; c++) {
    sheet.getColumn(c).width = 12;
    sheet.getColumn(c).alignment = { horizontal: 'right' };
  }

  // Freeze the two header rows and the identity block.
  sheet.views = [{ state: 'frozen', xSplit: IDENTITY_COLS, ySplit: 2 }];

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
