import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

// Be Vietnam Pro ships complete (non-subsetted) TTFs with full Vietnamese glyph
// coverage — pdfkit's built-in AFM fonts cannot render diacritics.
const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf');
const FONT_SEMIBOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf');
const FONT_BOLD = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');

const F_REGULAR = 'BVP';
const F_SEMIBOLD = 'BVP-SemiBold';
const F_BOLD = 'BVP-Bold';

const PAGE_MARGIN = 48;

export interface HandoverParty {
  fullName: string;
  employeeCode: string;
}

export interface HandoverPdfData {
  companyName: string;
  assetCode: string;
  assetName: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  conditionOut: string | null;
  assignedAt: Date;
  note: string | null;
  recipient: HandoverParty;
  handedOverBy: HandoverParty | null;
  ackStatus: 'PENDING' | 'SIGNED';
  ackMethod: 'ON_SCREEN' | 'IN_APP' | null;
  acknowledgedAt: Date | null;
  signatureImage: string | null; // PNG data URL
}

const L = {
  title: 'BIÊN BẢN BÀN GIAO TÀI SẢN',
  intro:
    'Hôm nay, chúng tôi gồm các bên dưới đây tiến hành bàn giao và tiếp nhận tài sản với nội dung như sau:',
  partyGiver: 'BÊN GIAO',
  partyReceiver: 'BÊN NHẬN',
  code: 'Mã NV',
  assetSection: 'THÔNG TIN TÀI SẢN',
  assetCode: 'Mã tài sản',
  assetName: 'Tên tài sản',
  brand: 'Hãng',
  model: 'Model',
  serial: 'Số serial',
  condition: 'Tình trạng khi giao',
  assignedAt: 'Ngày bàn giao',
  note: 'Ghi chú',
  ackSection: 'XÁC NHẬN',
  signedBy: 'Người nhận đã ký xác nhận',
  signedVia: 'Hình thức',
  signedAt: 'Thời điểm ký',
  pending: 'Biên bản chưa được người nhận ký xác nhận.',
  giverSign: 'Đại diện bên giao',
  receiverSign: 'Người nhận',
  signHint: '(Ký, ghi rõ họ tên)',
} as const;

const CONDITION_VI: Record<string, string> = {
  NEW: 'Mới',
  GOOD: 'Tốt',
  FAIR: 'Khá',
  POOR: 'Kém',
};

const METHOD_VI: Record<string, string> = {
  ON_SCREEN: 'Ký trực tiếp trên màn hình',
  IN_APP: 'Xác nhận điện tử qua ứng dụng',
};

const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function sectionTitle(doc: Doc, title: string): void {
  doc.moveDown(0.5);
  doc.font(F_BOLD).fontSize(9).fillColor('#6B7280').text(title, PAGE_MARGIN, doc.y, {
    characterSpacing: 0.5,
  });
  doc.moveDown(0.3);
}

// A "Nhãn: giá trị" line — label muted, value in regular ink.
function field(doc: Doc, label: string, value: string): void {
  const left = PAGE_MARGIN;
  const width = contentWidth(doc);
  const y = doc.y;
  doc.fontSize(10);
  doc.font(F_REGULAR).fillColor('#6B7280').text(`${label}: `, left, y, { width: width * 0.32, continued: false });
  doc.font(F_SEMIBOLD).fillColor('#111827').text(value, left + width * 0.32, y, { width: width * 0.68 });
  doc.moveDown(0.45);
}

// Decode a PNG data URL into a Buffer pdfkit can embed (also reused to serve the
// signature image over a dedicated, authorized endpoint); null if not a PNG.
export function decodeSignaturePng(dataUrl: string | null): Buffer | null {
  if (!dataUrl) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
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

/** Asset handover record ("Biên bản bàn giao") as a one-page A4 PDF. */
export async function renderHandoverPdf(data: HandoverPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  registerFonts(doc);

  const left = PAGE_MARGIN;
  const width = contentWidth(doc);

  // Header — company + title.
  doc.font(F_BOLD).fontSize(13).fillColor('#111827').text(data.companyName || ' ', left, doc.y, {
    align: 'center',
    width,
  });
  doc.moveDown(0.4);
  doc.font(F_BOLD).fontSize(16).fillColor('#111827').text(L.title, left, doc.y, { align: 'center', width });
  doc.moveDown(0.2);
  doc.font(F_REGULAR).fontSize(9.5).fillColor('#6B7280').text(
    dateFmt.format(data.assignedAt),
    left,
    doc.y,
    { align: 'center', width },
  );
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#E5E7EB').stroke();
  doc.moveDown(0.6);

  doc.font(F_REGULAR).fontSize(10).fillColor('#374151').text(L.intro, left, doc.y, { width });
  doc.moveDown(0.4);

  // Parties.
  doc.fontSize(9.5);
  doc.font(F_BOLD).fillColor('#6B7280').text(L.partyGiver, left, doc.y, { characterSpacing: 0.5 });
  doc.moveDown(0.2);
  const giver = data.handedOverBy;
  field(doc, L.partyGiver, giver ? `${giver.fullName} (${L.code} ${giver.employeeCode})` : '—');

  doc.font(F_BOLD).fontSize(9.5).fillColor('#6B7280').text(L.partyReceiver, left, doc.y, { characterSpacing: 0.5 });
  doc.moveDown(0.2);
  field(doc, L.partyReceiver, `${data.recipient.fullName} (${L.code} ${data.recipient.employeeCode})`);

  // Asset.
  sectionTitle(doc, L.assetSection);
  field(doc, L.assetCode, data.assetCode);
  field(doc, L.assetName, data.assetName);
  if (data.brand) field(doc, L.brand, data.brand);
  if (data.model) field(doc, L.model, data.model);
  if (data.serialNumber) field(doc, L.serial, data.serialNumber);
  field(doc, L.condition, data.conditionOut ? (CONDITION_VI[data.conditionOut] ?? data.conditionOut) : '—');
  field(doc, L.assignedAt, dateFmt.format(data.assignedAt));
  if (data.note) field(doc, L.note, data.note);

  // Acknowledgement.
  sectionTitle(doc, L.ackSection);
  if (data.ackStatus === 'SIGNED') {
    field(doc, L.signedVia, data.ackMethod ? (METHOD_VI[data.ackMethod] ?? data.ackMethod) : '—');
    if (data.acknowledgedAt) field(doc, L.signedAt, dateTimeFmt.format(data.acknowledgedAt));
  } else {
    doc.font(F_REGULAR).fontSize(10).fillColor('#B45309').text(L.pending, left, doc.y, { width });
    doc.moveDown(0.4);
  }

  // Signature block — two columns. Receiver column embeds the captured signature.
  doc.moveDown(1.2);
  const colW = width / 2;
  const blockY = doc.y;

  doc.font(F_SEMIBOLD).fontSize(10).fillColor('#111827');
  doc.text(L.giverSign, left, blockY, { width: colW, align: 'center' });
  doc.text(L.receiverSign, left + colW, blockY, { width: colW, align: 'center' });

  doc.font(F_REGULAR).fontSize(8).fillColor('#9CA3AF');
  doc.text(L.signHint, left, blockY + 14, { width: colW, align: 'center' });
  doc.text(L.signHint, left + colW, blockY + 14, { width: colW, align: 'center' });

  // Receiver's drawn/electronic signature, centred in the right column.
  const sig = decodeSignaturePng(data.signatureImage);
  if (sig) {
    const sigW = 150;
    const sigH = 60;
    const sigX = left + colW + (colW - sigW) / 2;
    try {
      doc.image(sig, sigX, blockY + 30, { fit: [sigW, sigH], align: 'center' });
    } catch {
      // A corrupt image must not break the document — leave the line blank.
    }
  }

  // Signature lines under each column.
  const lineY = blockY + 100;
  doc.moveTo(left + 30, lineY).lineTo(left + colW - 30, lineY).lineWidth(0.5).strokeColor('#9CA3AF').stroke();
  doc.moveTo(left + colW + 30, lineY).lineTo(left + width - 30, lineY).lineWidth(0.5).strokeColor('#9CA3AF').stroke();

  doc.font(F_SEMIBOLD).fontSize(9).fillColor('#374151');
  if (giver) doc.text(giver.fullName, left, lineY + 6, { width: colW, align: 'center' });
  doc.text(data.recipient.fullName, left + colW, lineY + 6, { width: colW, align: 'center' });

  return collect(doc);
}
