import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

// Be Vietnam Pro TTFs render Vietnamese diacritics + the ₫ sign (pdfkit AFM cannot).
const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf');
const FONT_SEMIBOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf');
const FONT_BOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');

const F_REGULAR = 'BVP';
const F_SEMIBOLD = 'BVP-SemiBold';
const F_BOLD = 'BVP-Bold';
const MARGIN = 48;

type Doc = PDFKit.PDFDocument;

export interface TopUpPdfData {
  entityName: string;
  title: string;
  amount: string; // whole VND string
  currency: string;
  period: string | null;
  neededByDate: Date | null;
  status: string;
  statusLabel: string;
  justification: string;
  requesterName: string | null;
  createdAt: Date;
  reviewedByName: string | null;
  reviewNote: string | null;
  fundedAccountName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã huỷ',
};

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 10).split('-').reverse().join('/');
}
function fmtMoney(v: string): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(v)))} ₫`;
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

export async function renderTopUpPdf(data: TopUpPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  doc.registerFont(F_REGULAR, FONT_REGULAR);
  doc.registerFont(F_SEMIBOLD, FONT_SEMIBOLD);
  doc.registerFont(F_BOLD, FONT_BOLD);

  // Header
  doc.font(F_BOLD).fontSize(11).fillColor('#111827').text(data.entityName.toUpperCase(), { align: 'left' });
  doc.moveDown(0.8);
  doc.font(F_BOLD).fontSize(18).text('ĐỀ XUẤT NẠP QUỸ', { align: 'center' });
  doc.font(F_REGULAR).fontSize(10).fillColor('#6B7280').text('(FUND TOP-UP REQUEST)', { align: 'center' });
  doc.moveDown(1.2);

  // Meta rows
  const row = (label: string, value: string) => {
    doc.font(F_SEMIBOLD).fontSize(10).fillColor('#374151').text(`${label}: `, { continued: true });
    doc.font(F_REGULAR).fillColor('#111827').text(value);
  };
  doc.fillColor('#111827');
  row('Tiêu đề', data.title);
  row('Người đề xuất', data.requesterName ?? '—');
  row('Ngày lập', fmtDate(data.createdAt));
  if (data.period) row('Kỳ liên quan', data.period);
  row('Cần trước ngày', fmtDate(data.neededByDate));
  row('Trạng thái', data.statusLabel || STATUS_LABEL[data.status] || data.status);
  if (data.fundedAccountName) row('Đã nạp vào', data.fundedAccountName);
  doc.moveDown(0.8);

  // Amount highlight
  doc.font(F_SEMIBOLD).fontSize(11).fillColor('#374151').text('Số tiền đề nghị nạp');
  doc.font(F_BOLD).fontSize(22).fillColor('#111827').text(fmtMoney(data.amount));
  doc.moveDown(1);

  // Justification
  doc.font(F_SEMIBOLD).fontSize(11).fillColor('#374151').text('GIẢI TRÌNH');
  doc.moveDown(0.3);
  doc.font(F_REGULAR).fontSize(10.5).fillColor('#111827').text(data.justification, { align: 'left', lineGap: 2 });

  if (data.reviewNote) {
    doc.moveDown(0.8);
    doc.font(F_SEMIBOLD).fontSize(10).fillColor('#B91C1C').text('Ghi chú duyệt: ', { continued: true });
    doc.font(F_REGULAR).fillColor('#111827').text(data.reviewNote);
  }
  if (data.reviewedByName) {
    doc.moveDown(0.8);
    doc.font(F_REGULAR).fontSize(10).fillColor('#6B7280').text(`Người duyệt: ${data.reviewedByName}`);
  }

  // Signature line
  doc.moveDown(2.5);
  const y = doc.y;
  const half = (doc.page.width - MARGIN * 2) / 2;
  doc.font(F_SEMIBOLD).fontSize(10).fillColor('#374151').text('Người đề xuất', MARGIN, y, { width: half, align: 'center' });
  doc.text('Founder phê duyệt', MARGIN + half, y, { width: half, align: 'center' });

  return collect(doc);
}
