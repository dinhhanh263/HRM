import ExcelJS from 'exceljs';
import type { KpiCycleDetailDto } from '@hrm/shared';

/**
 * Xuất 1 chu kỳ KPI ra .xlsx: sheet "Tổng hợp" (thành viên × trụ cột + tổng +
 * xếp loại) — vừa là bảng team vừa là điểm cá nhân. Điểm là số thật để Excel sort/sum.
 */
export async function buildKpiCycleWorkbook(cycle: KpiCycleDetailDto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HRM';
  const sheet = wb.addWorksheet('Tổng hợp KPI');

  const pillars = cycle.framework.pillars;
  const header = ['Thành viên', 'Hồ sơ trọng số', ...pillars.map((p) => p.name), 'Tổng (weighted)', 'Xếp loại'];
  sheet.addRow([`${cycle.frameworkName} — ${cycle.period}`]);
  sheet.mergeCells(1, 1, 1, header.length);
  sheet.getRow(1).font = { bold: true, size: 13 };
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  });

  for (const sc of cycle.scorecards) {
    const pillarScores = pillars.map((p) => {
      const v = sc.pillars.find((x) => x.pillarId === p.id)?.score;
      return v == null ? '' : Number(v);
    });
    sheet.addRow([
      sc.employeeName,
      sc.weightProfileName ?? '—',
      ...pillarScores,
      sc.weightedTotal == null ? '' : Number(sc.weightedTotal),
      sc.ratingLabel ?? '',
    ]);
  }

  sheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 28 : i === 1 ? 18 : 16;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
