import ExcelJS from 'exceljs';
import type { FinanceReportResponse, FinanceReportGroup } from '@hrm/shared';

const MONTHS_VI = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle' };
}

function addGroupSheet(wb: ExcelJS.Workbook, name: string, label: string, rows: FinanceReportGroup[]) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = [
    { header: label, key: 'label', width: 32 },
    { header: 'Thu', key: 'in', width: 18 },
    { header: 'Chi', key: 'out', width: 18 },
  ];
  styleHeader(sheet.getRow(1));
  for (const r of rows) sheet.addRow({ label: r.label, in: Number(r.in), out: Number(r.out) });
  ['B', 'C'].forEach((c) => (sheet.getColumn(c).numFmt = '#,##0'));
}

/** Build the multi-sheet finance report workbook (Vietnamese headers). */
export async function buildFinanceReportExcel(data: FinanceReportResponse): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1 — by month.
  const byMonth = wb.addWorksheet('Theo tháng');
  byMonth.columns = [
    { header: `Tháng (${data.year})`, key: 'month', width: 16 },
    { header: 'Thu', key: 'in', width: 18 },
    { header: 'Chi', key: 'out', width: 18 },
    { header: 'Chênh lệch', key: 'net', width: 18 },
  ];
  styleHeader(byMonth.getRow(1));
  for (const m of data.months) {
    byMonth.addRow({ month: MONTHS_VI[m.month - 1], in: Number(m.in), out: Number(m.out), net: Number(m.net) });
  }
  const totalRow = byMonth.addRow({ month: 'TỔNG', in: Number(data.totalIn), out: Number(data.totalOut), net: Number(data.net) });
  totalRow.font = { bold: true };
  ['B', 'C', 'D'].forEach((c) => (byMonth.getColumn(c).numFmt = '#,##0'));

  addGroupSheet(wb, 'Theo pháp nhân', 'Pháp nhân', data.byEntity);
  addGroupSheet(wb, 'Theo danh mục', 'Danh mục', data.byCategory);
  addGroupSheet(wb, 'Theo bộ phận', 'Bộ phận', data.byDepartment);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
