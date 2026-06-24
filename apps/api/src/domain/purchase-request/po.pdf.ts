import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

// Be Vietnam Pro ships complete (non-subsetted) TTFs with full Vietnamese glyph
// coverage incl. the ₫ sign — pdfkit's built-in AFM fonts cannot render diacritics.
const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf');
const FONT_SEMIBOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf');
const FONT_BOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');

const F_REGULAR = 'BVP';
const F_SEMIBOLD = 'BVP-SemiBold';
const F_BOLD = 'BVP-Bold';

const PAGE_MARGIN = 42;

export interface PoPdfCompany {
  name: string;
  address: string;
  taxCode: string;
  phone: string;
}

export interface PoPdfItem {
  lineNo: number;
  sku: string | null;
  productName: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string; // pre-tax — "Thành Tiền" matches the sample invoice
}

export interface PoPdfData {
  company: PoPdfCompany;
  /** SPEC-043: optional issuing-entity logo (PNG/JPEG) embedded in the header. */
  logoBuffer?: Buffer | null;
  code: string;
  createdAt: Date;
  requesterName: string;
  departmentName: string | null;
  vendorName: string;
  expectedDeliveryDate: Date | null;
  description: string | null;
  items: PoPdfItem[];
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  reviewedByName: string | null;
}

const L = {
  title: 'PHIẾU ĐỀ XUẤT MUA HÀNG',
  subtitle: '(PURCHASE REQUISITION)',
  code: 'Mã PR',
  createdAt: 'Ngày lập',
  requester: 'Người YC',
  department: 'Bộ phận',
  vendor: 'Kính gửi',
  expectedDelivery: 'Ngày giao DK',
  note: 'Ghi chú',
  colNo: 'STT',
  colSku: 'Mã SKU',
  colName: 'Tên Sản Phẩm',
  colUnit: 'ĐVT',
  colQty: 'Số Lượng',
  colPrice: 'Đơn Giá (₫)',
  colAmount: 'Thành Tiền (₫)',
  subtotal: 'TỔNG CỘNG',
  tax: 'Thuế VAT',
  total: 'TỔNG THANH TOÁN',
  signRequester: 'Người lập phiếu',
  signApprover: 'Quản lý phê duyệt',
} as const;

const vndFmt = new Intl.NumberFormat('vi-VN');
const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function money(value: string): string {
  const n = Math.round(Number(value));
  return `${vndFmt.format(Number.isFinite(n) ? n : 0)} ₫`;
}

function qty(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  // Drop trailing zeros so whole quantities show clean (2 not 2.000).
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
}

type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

// Column layout for the line-items table, as fractions of the content width.
const COL_FRAC = {
  no: 0.06,
  sku: 0.14,
  name: 0.34,
  unit: 0.08,
  qty: 0.1,
  price: 0.14,
  amount: 0.14,
} as const;

function colX(doc: Doc): { no: number; sku: number; name: number; unit: number; qty: number; price: number; amount: number; end: number } {
  const left = PAGE_MARGIN;
  const w = contentWidth(doc);
  const no = left;
  const sku = no + w * COL_FRAC.no;
  const name = sku + w * COL_FRAC.sku;
  const unit = name + w * COL_FRAC.name;
  const q = unit + w * COL_FRAC.unit;
  const price = q + w * COL_FRAC.qty;
  const amount = price + w * COL_FRAC.price;
  const end = left + w;
  return { no, sku, name, unit, qty: q, price, amount, end };
}

const ROW_PAD = 5;

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

// Logo box at the top-right of the header. PNG/JPEG only; a corrupt/unsupported
// buffer must never break the document (try/catch, like handover.pdf.ts).
const LOGO_BOX = 56;

// Company header — name big/bold, then a single muted line "address · 📞 phone ·
// MST: taxCode" with empty fields hidden. When a logo buffer is present it is
// drawn in a fixed box on the right and the text column is narrowed to clear it.
function drawHeader(doc: Doc, company: PoPdfCompany, logoBuffer?: Buffer | null): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const topY = doc.y;

  let hasLogo = false;
  if (logoBuffer && logoBuffer.length) {
    try {
      doc.image(logoBuffer, left + width - LOGO_BOX, topY, {
        fit: [LOGO_BOX, LOGO_BOX],
      });
      hasLogo = true;
    } catch {
      // Unsupported/corrupt image — skip the logo, keep the rest of the header.
    }
  }
  // Leave a gutter so the text never overlaps the logo box.
  const textWidth = hasLogo ? width - LOGO_BOX - 12 : width;

  doc.font(F_BOLD).fontSize(15).fillColor('#111827').text(company.name || ' ', left, topY, { width: textWidth });

  const parts: string[] = [];
  if (company.address?.trim()) parts.push(company.address.trim());
  if (company.phone?.trim()) parts.push(`ĐT: ${company.phone.trim()}`);
  if (company.taxCode?.trim()) parts.push(`MST: ${company.taxCode.trim()}`);
  if (parts.length) {
    doc.moveDown(0.1);
    doc.font(F_REGULAR).fontSize(9).fillColor('#6B7280').text(parts.join('  ·  '), left, doc.y, { width: textWidth });
  }
  // Keep the divider below whichever is taller — the text block or the logo box.
  if (hasLogo) {
    doc.y = Math.max(doc.y, topY + LOGO_BOX);
  }
  doc.moveDown(0.5);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#E5E7EB').stroke();
  doc.moveDown(0.5);
}

function drawTitle(doc: Doc): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  doc.font(F_BOLD).fontSize(16).fillColor('#111827').text(L.title, left, doc.y, { align: 'center', width });
  doc.moveDown(0.1);
  doc.font(F_REGULAR).fontSize(9.5).fillColor('#6B7280').text(L.subtitle, left, doc.y, { align: 'center', width });
  doc.moveDown(0.6);
}

// Info grid — two columns of label: value lines.
function drawInfoGrid(doc: Doc, data: PoPdfData): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const half = width / 2;

  const pair = (lLabel: string, lVal: string, rLabel: string, rVal: string) => {
    const y = doc.y;
    doc.fontSize(9.5);
    doc.font(F_REGULAR).fillColor('#6B7280').text(`${lLabel}: `, left, y, { width: half, continued: true });
    doc.font(F_SEMIBOLD).fillColor('#111827').text(lVal || '—');
    doc.font(F_REGULAR).fillColor('#6B7280').text(`${rLabel}: `, left + half, y, { width: half, continued: true });
    doc.font(F_SEMIBOLD).fillColor('#111827').text(rVal || '—');
    doc.moveDown(0.35);
  };

  pair(L.code, data.code, L.createdAt, dateFmt.format(data.createdAt));
  pair(L.requester, data.requesterName, L.department, data.departmentName ?? '—');
  pair(
    L.vendor,
    data.vendorName,
    L.expectedDelivery,
    data.expectedDeliveryDate ? dateFmt.format(data.expectedDeliveryDate) : '—',
  );
  if (data.description?.trim()) {
    const y = doc.y;
    doc.font(F_REGULAR).fontSize(9.5).fillColor('#6B7280').text(`${L.note}: `, left, y, { continued: true });
    doc.font(F_SEMIBOLD).fillColor('#111827').text(data.description.trim(), { width });
    doc.moveDown(0.35);
  }
  doc.moveDown(0.3);
}

// Draw the table header row (column titles on a tinted band). Returns the y below it.
function drawTableHeader(doc: Doc): void {
  const c = colX(doc);
  const y = doc.y;
  const rowH = 20;
  doc.rect(c.no, y, c.end - c.no, rowH).fillColor('#F3F4F6').fill();
  doc.font(F_SEMIBOLD).fontSize(8.5).fillColor('#374151');
  const ty = y + ROW_PAD + 1;
  doc.text(L.colNo, c.no + 2, ty, { width: c.sku - c.no - 4, align: 'center' });
  doc.text(L.colSku, c.sku + 2, ty, { width: c.name - c.sku - 4 });
  doc.text(L.colName, c.name + 2, ty, { width: c.unit - c.name - 4 });
  doc.text(L.colUnit, c.unit + 2, ty, { width: c.qty - c.unit - 4, align: 'center' });
  doc.text(L.colQty, c.qty + 2, ty, { width: c.price - c.qty - 4, align: 'right' });
  doc.text(L.colPrice, c.price + 2, ty, { width: c.amount - c.price - 4, align: 'right' });
  doc.text(L.colAmount, c.amount + 2, ty, { width: c.end - c.amount - 4, align: 'right' });
  doc.y = y + rowH;
  // bottom border of header
  doc.moveTo(c.no, doc.y).lineTo(c.end, doc.y).lineWidth(0.5).strokeColor('#D1D5DB').stroke();
}

// Measure the height a single item row needs (product name may wrap).
function measureRowHeight(doc: Doc, item: PoPdfItem): number {
  const c = colX(doc);
  doc.font(F_REGULAR).fontSize(8.5);
  const nameH = doc.heightOfString(item.productName, { width: c.unit - c.name - 4 });
  return Math.max(nameH, 11) + ROW_PAD * 2;
}

function drawItemRow(doc: Doc, item: PoPdfItem): void {
  const c = colX(doc);
  const y = doc.y;
  const rowH = measureRowHeight(doc, item);
  doc.font(F_REGULAR).fontSize(8.5).fillColor('#111827');
  const ty = y + ROW_PAD;
  doc.text(String(item.lineNo), c.no + 2, ty, { width: c.sku - c.no - 4, align: 'center' });
  doc.text(item.sku ?? '', c.sku + 2, ty, { width: c.name - c.sku - 4 });
  doc.text(item.productName, c.name + 2, ty, { width: c.unit - c.name - 4 });
  doc.text(item.unit ?? '', c.unit + 2, ty, { width: c.qty - c.unit - 4, align: 'center' });
  doc.text(qty(item.quantity), c.qty + 2, ty, { width: c.price - c.qty - 4, align: 'right' });
  doc.text(money(item.unitPrice), c.price + 2, ty, { width: c.amount - c.price - 4, align: 'right' });
  doc.text(money(item.lineSubtotal), c.amount + 2, ty, { width: c.end - c.amount - 4, align: 'right' });
  doc.y = y + rowH;
  doc.moveTo(c.no, doc.y).lineTo(c.end, doc.y).lineWidth(0.3).strokeColor('#E5E7EB').stroke();
}

// One total line, right-aligned. `strong` for the grand total.
function totalLine(doc: Doc, label: string, value: string, opts: { strong?: boolean } = {}): void {
  const c = colX(doc);
  const y = doc.y + 3;
  // Value spans the price+amount columns so the grand total never wraps at 11pt.
  const valueLeft = c.price + 2;
  const labelLeft = c.name;
  doc.font(opts.strong ? F_BOLD : F_SEMIBOLD).fontSize(opts.strong ? 11 : 9.5).fillColor('#111827');
  doc.text(label, labelLeft, y, { width: valueLeft - labelLeft - 6, align: 'right' });
  doc.text(money(value), valueLeft, y, { width: c.end - valueLeft - 4, align: 'right', lineBreak: false });
  doc.y = y + (opts.strong ? 16 : 13);
}

function drawSignatures(doc: Doc, data: PoPdfData): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const colW = width / 2;
  doc.moveDown(1.5);
  const blockY = doc.y;
  doc.font(F_SEMIBOLD).fontSize(10).fillColor('#111827');
  doc.text(L.signRequester, left, blockY, { width: colW, align: 'center' });
  doc.text(L.signApprover, left + colW, blockY, { width: colW, align: 'center' });

  const lineY = blockY + 70;
  doc.moveTo(left + 30, lineY).lineTo(left + colW - 30, lineY).lineWidth(0.5).strokeColor('#9CA3AF').stroke();
  doc.moveTo(left + colW + 30, lineY).lineTo(left + width - 30, lineY).lineWidth(0.5).strokeColor('#9CA3AF').stroke();

  doc.font(F_SEMIBOLD).fontSize(9).fillColor('#374151');
  doc.text(data.requesterName || ' ', left, lineY + 6, { width: colW, align: 'center' });
  doc.text(data.reviewedByName || ' ', left + colW, lineY + 6, { width: colW, align: 'center' });
}

/** Purchase requisition ("Phiếu đề xuất mua hàng") as an A4 PDF. */
export async function renderPurchaseOrderPdf(data: PoPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  registerFonts(doc);

  drawHeader(doc, data.company, data.logoBuffer);
  drawTitle(doc);
  drawInfoGrid(doc, data);
  drawTableHeader(doc);

  // Items — auto page-break with repeated table header when the page fills.
  const bottomLimit = doc.page.height - PAGE_MARGIN - 60; // leave room for the row
  for (const item of data.items) {
    const needed = measureRowHeight(doc, item);
    if (doc.y + needed > bottomLimit) {
      doc.addPage();
      drawTableHeader(doc);
    }
    drawItemRow(doc, item);
  }

  // Totals block — keep on the same page as the last row if it fits, else new page.
  doc.moveDown(0.4);
  if (doc.y + 70 > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
  totalLine(doc, L.subtotal, data.subtotal);
  totalLine(doc, L.tax, data.taxAmount);
  totalLine(doc, L.total, data.totalAmount, { strong: true });

  drawSignatures(doc, data);

  return collect(doc);
}
