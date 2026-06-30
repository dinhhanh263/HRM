import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

// Be Vietnam Pro for full Vietnamese + ₫ glyph coverage (same as PO PDF).
const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf');
const FONT_BOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');
const F = 'BVP';
const FB = 'BVP-Bold';
const MARGIN = 42;

export interface QuotePdfData {
  code: string;
  createdAt: Date;
  validUntil: Date | null;
  currency: string;
  total: string;
  entity: { name: string; address: string | null; taxCode: string | null; phone: string | null } | null;
  customerName: string;
  dealTitle: string;
  items: { description: string; quantity: string; unitPrice: string; discountPct: string; lineTotal: string }[];
}

function money(v: string, currency: string): string {
  const n = Number(v);
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('vi-VN')} ${currency}`;
  }
}

export function buildQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    doc.registerFont(F, FONT_REGULAR);
    doc.registerFont(FB, FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header: issuing entity
    if (data.entity) {
      doc.font(FB).fontSize(13).text(data.entity.name);
      doc.font(F).fontSize(9);
      if (data.entity.address) doc.text(data.entity.address);
      const line = [data.entity.taxCode && `MST: ${data.entity.taxCode}`, data.entity.phone && `ĐT: ${data.entity.phone}`].filter(Boolean).join('   ');
      if (line) doc.text(line);
    }
    doc.moveDown(1);
    doc.font(FB).fontSize(20).text('BÁO GIÁ', { align: 'center' });
    doc.font(F).fontSize(9).text(`Số: ${data.code}`, { align: 'center' });
    doc.moveDown(1);

    // Meta
    doc.fontSize(10);
    doc.font(FB).text('Khách hàng: ', { continued: true }).font(F).text(data.customerName);
    doc.font(FB).text('Nội dung: ', { continued: true }).font(F).text(data.dealTitle);
    doc.font(FB).text('Ngày: ', { continued: true }).font(F).text(data.createdAt.toLocaleDateString('vi-VN'));
    if (data.validUntil) {
      doc.font(FB).text('Hiệu lực đến: ', { continued: true }).font(F).text(data.validUntil.toLocaleDateString('vi-VN'));
    }
    doc.moveDown(1);

    // Table
    const cols = [
      { x: MARGIN, w: 24, label: 'STT' },
      { x: MARGIN + 24, w: 210, label: 'Mô tả' },
      { x: MARGIN + 234, w: 50, label: 'SL' },
      { x: MARGIN + 284, w: 90, label: 'Đơn giá' },
      { x: MARGIN + 374, w: 40, label: 'CK%' },
      { x: MARGIN + 414, w: 97, label: 'Thành tiền' },
    ];
    let y = doc.y;
    doc.font(FB).fontSize(9);
    cols.forEach((c) => doc.text(c.label, c.x, y, { width: c.w, align: c.label === 'Mô tả' || c.label === 'STT' ? 'left' : 'right' }));
    y += 16;
    doc.moveTo(MARGIN, y - 3).lineTo(MARGIN + 511, y - 3).stroke();

    doc.font(F).fontSize(9);
    data.items.forEach((it, i) => {
      const row = [
        String(i + 1),
        it.description,
        Number(it.quantity).toLocaleString('vi-VN'),
        money(it.unitPrice, data.currency),
        `${Number(it.discountPct)}%`,
        money(it.lineTotal, data.currency),
      ];
      const rowH = Math.max(14, doc.heightOfString(row[1], { width: cols[1].w }));
      cols.forEach((c, ci) => doc.text(row[ci], c.x, y, { width: c.w, align: ci === 0 || ci === 1 ? 'left' : 'right' }));
      y += rowH + 4;
    });
    doc.moveTo(MARGIN, y).lineTo(MARGIN + 511, y).stroke();
    y += 8;

    // Total
    doc.font(FB).fontSize(11);
    doc.text('Tổng cộng:', MARGIN + 284, y, { width: 130, align: 'right' });
    doc.text(money(data.total, data.currency), MARGIN + 414, y, { width: 97, align: 'right' });

    doc.end();
  });
}
