import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import type { PayslipDto, PayrollRunDto, PayslipOvertimeDto } from '@hrm/shared';

// Be Vietnam Pro ships complete (non-subsetted) TTFs with full Vietnamese glyph
// coverage incl. the ₫ sign — pdfkit's built-in AFM fonts cannot render diacritics.
const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf');
const FONT_SEMIBOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf');
const FONT_BOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');

const F_REGULAR = 'BVP';
const F_SEMIBOLD = 'BVP-SemiBold';
const F_BOLD = 'BVP-Bold';

export interface PayslipPdfContext {
  companyName: string;
}

const PAGE_MARGIN = 48;

// Vietnamese labels — the product language. Money is rendered with vi-VN grouping
// and a trailing ₫, mirroring the web payslip.
const L = {
  title: 'PHIẾU LƯƠNG',
  period: 'Kỳ lương',
  employee: 'Nhân viên',
  code: 'Mã NV',
  department: 'Phòng ban',
  dependents: 'Người phụ thuộc',
  attendance: 'CHẤM CÔNG',
  workingDays: 'Ngày công chuẩn',
  daysPresent: 'Ngày có mặt',
  paidLeaveDays: 'Nghỉ có lương',
  unpaidLeaveDays: 'Nghỉ không lương',
  daysAbsent: 'Ngày vắng',
  holidayCount: 'Ngày lễ',
  earnings: 'THU NHẬP',
  proratedBase: 'Lương cơ bản (theo công)',
  allowanceTotal: 'Phụ cấp',
  otPay: 'Lương tăng ca',
  grossPay: 'Tổng thu nhập',
  deductions: 'KHẤU TRỪ',
  socialInsurance: 'Bảo hiểm xã hội (BHXH)',
  healthInsurance: 'Bảo hiểm y tế (BHYT)',
  unemploymentInsurance: 'Bảo hiểm thất nghiệp (BHTN)',
  personalIncomeTax: 'Thuế thu nhập cá nhân',
  unionFee: 'Phí công đoàn',
  otherDeductions: 'Khấu trừ khác',
  taxableIncome: 'Thu nhập tính thuế',
  netPay: 'THỰC NHẬN',
  otNight: 'ban đêm',
  footer: 'Phiếu lương được tạo tự động — không cần chữ ký.',
} as const;

const OT_CATEGORY: Record<PayslipOvertimeDto['category'], string> = {
  OT_WEEKDAY: 'Tăng ca ngày thường',
  OT_WEEKEND: 'Tăng ca cuối tuần',
  OT_HOLIDAY: 'Tăng ca ngày lễ',
};

const vndFmt = new Intl.NumberFormat('vi-VN');

function money(value: string): string {
  const n = Math.round(Number(value));
  return `${vndFmt.format(Number.isFinite(n) ? n : 0)} ₫`;
}

type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

// A label/value money row: label left, amount right-aligned. `deduction` prefixes
// a minus sign; `strong` renders both sides in semibold with a top rule.
function moneyRow(
  doc: Doc,
  label: string,
  value: string,
  opts: { deduction?: boolean; strong?: boolean } = {},
): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const y = doc.y;

  if (opts.strong) {
    doc.moveTo(left, y - 2).lineTo(left + width, y - 2).lineWidth(0.5).strokeColor('#D1D5DB').stroke();
  }

  const amount = `${opts.deduction ? '−' : ''}${money(value)}`;
  doc.font(opts.strong ? F_SEMIBOLD : F_REGULAR).fontSize(10).fillColor('#111827');
  doc.text(label, left, y, { width: width * 0.62, continued: false });
  doc.font(opts.strong ? F_SEMIBOLD : F_REGULAR).fillColor('#111827');
  doc.text(amount, left + width * 0.62, y, { width: width * 0.38, align: 'right' });
  doc.moveDown(0.55);
}

function sectionTitle(doc: Doc, title: string): void {
  doc.moveDown(0.4);
  doc.font(F_BOLD).fontSize(9).fillColor('#6B7280').text(title, PAGE_MARGIN, doc.y, {
    characterSpacing: 0.5,
  });
  doc.moveDown(0.3);
}

// Two-column key/value line used in the attendance grid.
function statPair(doc: Doc, leftLabel: string, leftVal: string, rightLabel: string, rightVal: string): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const half = width / 2;
  const y = doc.y;
  doc.fontSize(9.5);
  doc.font(F_REGULAR).fillColor('#6B7280').text(leftLabel, left, y, { width: half * 0.62 });
  doc.font(F_SEMIBOLD).fillColor('#111827').text(leftVal, left + half * 0.62, y, { width: half * 0.38, align: 'right' });
  doc.font(F_REGULAR).fillColor('#6B7280').text(rightLabel, left + half, y, { width: half * 0.62 });
  doc.font(F_SEMIBOLD).fillColor('#111827').text(rightVal, left + half + half * 0.62, y, { width: half * 0.38, align: 'right' });
  doc.moveDown(0.5);
}

// Draw a single payslip onto the current page, starting at the current cursor.
function drawPayslip(doc: Doc, slip: PayslipDto, ctx: PayslipPdfContext): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);

  // Header — company + title + period.
  doc.font(F_BOLD).fontSize(15).fillColor('#111827').text(ctx.companyName, left, doc.y);
  doc.moveDown(0.15);
  const titleY = doc.y;
  doc.font(F_SEMIBOLD).fontSize(13).fillColor('#4A9EBF').text(L.title, left, titleY, { width: width * 0.6 });
  doc.font(F_REGULAR).fontSize(10).fillColor('#6B7280').text(`${L.period}: ${slip.period}`, left + width * 0.6, titleY + 2, {
    width: width * 0.4,
    align: 'right',
  });
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#E5E7EB').stroke();
  doc.moveDown(0.6);

  // Employee block.
  const emp = slip.employee;
  doc.fontSize(10);
  const nameY = doc.y;
  doc.font(F_SEMIBOLD).fillColor('#111827').text(emp?.fullName ?? '—', left, nameY, { width: width * 0.62 });
  doc.font(F_REGULAR).fillColor('#6B7280').text(`${L.code}: ${emp?.employeeCode ?? '—'}`, left + width * 0.62, nameY, {
    width: width * 0.38,
    align: 'right',
  });
  doc.font(F_REGULAR).fillColor('#6B7280').fontSize(9.5);
  const metaY = doc.y;
  doc.text(`${L.department}: ${emp?.departmentName ?? '—'}`, left, metaY, { width: width * 0.62 });
  doc.text(`${L.dependents}: ${slip.dependents}`, left + width * 0.62, metaY, { width: width * 0.38, align: 'right' });
  doc.moveDown(0.4);

  // Attendance.
  sectionTitle(doc, L.attendance);
  statPair(doc, L.workingDays, String(slip.workingDays), L.daysPresent, String(slip.daysPresent));
  statPair(doc, L.paidLeaveDays, String(slip.paidLeaveDays), L.unpaidLeaveDays, String(slip.unpaidLeaveDays));
  statPair(doc, L.daysAbsent, String(slip.daysAbsent), L.holidayCount, String(slip.holidayCount));

  // Earnings.
  sectionTitle(doc, L.earnings);
  moneyRow(doc, L.proratedBase, slip.proratedBase);
  moneyRow(doc, L.allowanceTotal, slip.allowanceTotal);
  if (slip.overtime.length > 0) {
    for (const ot of slip.overtime) {
      const night = ot.night ? ` · ${L.otNight}` : '';
      const desc = `   ${OT_CATEGORY[ot.category]}${night} · ${ot.hours}h × ${ot.multiplier}`;
      const y = doc.y;
      doc.font(F_REGULAR).fontSize(8.5).fillColor('#9CA3AF');
      doc.text(desc, left, y, { width: width * 0.62 });
      doc.text(money(ot.amount), left + width * 0.62, y, { width: width * 0.38, align: 'right' });
      doc.moveDown(0.4);
    }
  }
  moneyRow(doc, L.otPay, slip.otPay);
  moneyRow(doc, L.grossPay, slip.grossPay, { strong: true });

  // Deductions.
  sectionTitle(doc, L.deductions);
  moneyRow(doc, L.socialInsurance, slip.socialInsurance, { deduction: true });
  moneyRow(doc, L.healthInsurance, slip.healthInsurance, { deduction: true });
  moneyRow(doc, L.unemploymentInsurance, slip.unemploymentInsurance, { deduction: true });
  moneyRow(doc, L.personalIncomeTax, slip.personalIncomeTax, { deduction: true });
  if (slip.unionFee !== '0') {
    moneyRow(doc, L.unionFee, slip.unionFee, { deduction: true });
  }
  if (slip.otherDeductions !== '0') {
    moneyRow(doc, L.otherDeductions, slip.otherDeductions, { deduction: true });
  }
  const taxY = doc.y;
  doc.font(F_REGULAR).fontSize(8.5).fillColor('#9CA3AF');
  doc.text(L.taxableIncome, left, taxY, { width: width * 0.62 });
  doc.text(money(slip.taxableIncome), left + width * 0.62, taxY, { width: width * 0.38, align: 'right' });
  doc.moveDown(0.8);

  // Net pay highlight box.
  const boxY = doc.y;
  const boxH = 34;
  doc.roundedRect(left, boxY, width, boxH, 6).fillColor('#EAF4F8').fill();
  doc.font(F_SEMIBOLD).fontSize(11).fillColor('#111827').text(L.netPay, left + 14, boxY + 11, { width: width * 0.5 });
  doc.font(F_BOLD).fontSize(13).fillColor('#2E7A96').text(money(slip.netPay), left + width * 0.5 - 14, boxY + 9, {
    width: width * 0.5,
    align: 'right',
  });
  doc.y = boxY + boxH;
  doc.moveDown(0.8);

  // Footer note.
  doc.font(F_REGULAR).fontSize(8).fillColor('#9CA3AF').text(L.footer, left, doc.y, { width });
}

function registerFonts(doc: Doc): void {
  doc.registerFont(F_REGULAR, FONT_REGULAR);
  doc.registerFont(F_SEMIBOLD, FONT_SEMIBOLD);
  doc.registerFont(F_BOLD, FONT_BOLD);
}

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** A single payslip as a one-page A4 PDF. */
export async function renderPayslipPdf(slip: PayslipDto, ctx: PayslipPdfContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  registerFonts(doc);
  drawPayslip(doc, slip, ctx);
  return collect(doc);
}

/** Every payslip in a run, one per page, in a single PDF. */
export async function renderRunPayslipsPdf(run: PayrollRunDto, ctx: PayslipPdfContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  registerFonts(doc);

  const slips = run.payslips ?? [];
  if (slips.length === 0) {
    doc.font(F_SEMIBOLD).fontSize(13).fillColor('#111827').text(ctx.companyName, PAGE_MARGIN, PAGE_MARGIN);
    doc.moveDown(0.5);
    doc.font(F_REGULAR).fontSize(10).fillColor('#6B7280').text(`${L.period}: ${run.period}`);
  } else {
    slips.forEach((slip, i) => {
      if (i > 0) {
        doc.addPage();
      }
      drawPayslip(doc, slip, ctx);
    });
  }

  return collect(doc);
}
