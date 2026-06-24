import { describe, it, expect } from 'vitest';
import { renderPurchaseOrderPdf } from '../../src/domain/purchase-request/po.pdf.js';

// Smoke test: the PO PDF renders to a valid (non-empty) %PDF buffer with the
// canonical sample numbers, across single- and multi-line (page-break) inputs.
describe('renderPurchaseOrderPdf', () => {
  const base = {
    company: {
      name: 'CÔNG TY CỔ PHẦN CODECRUSH',
      address: '123 Đường ABC, Q1, TP.HCM',
      taxCode: '0312345678',
      phone: '0901234567',
    },
    code: 'PR-20260623-001',
    createdAt: new Date('2026-06-23T03:00:00Z'),
    requesterName: 'Đinh Văn Hạnh',
    departmentName: 'Vận hành',
    vendorName: 'Công ty Gỗ Teak ABC',
    expectedDeliveryDate: new Date('2026-07-10T00:00:00Z'),
    description: 'Mua gỗ teak lô tháng 7',
    subtotal: '18954000',
    taxAmount: '1516320',
    totalAmount: '20470320',
    reviewedByName: 'Founder Nguyễn',
  };

  it('renders a valid PDF for a single line (sample numbers)', async () => {
    const buf = await renderPurchaseOrderPdf({
      ...base,
      items: [
        { lineNo: 1, sku: 'TEAK-01', productName: 'Gỗ teak loại A', unit: 'm3', quantity: '2', unitPrice: '9477000', lineSubtotal: '18954000' },
      ],
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renders multi-page when there are many line items (repeated header)', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      lineNo: i + 1,
      sku: `SKU-${i + 1}`,
      productName: `Sản phẩm số ${i + 1} với tên rất dài để kiểm tra xuống dòng`,
      unit: 'cái',
      quantity: '3',
      unitPrice: '125000',
      lineSubtotal: '375000',
    }));
    const buf = await renderPurchaseOrderPdf({ ...base, items });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(3000);
  });

  // SPEC-043: a valid PNG logo embeds; a corrupt buffer is skipped (try/catch), never throws.
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  );

  it('embeds a PNG logo in the header (SPEC-043)', async () => {
    const buf = await renderPurchaseOrderPdf({
      ...base,
      logoBuffer: PNG_1x1,
      items: [{ lineNo: 1, sku: null, productName: 'X', unit: null, quantity: '1', unitPrice: '1000', lineSubtotal: '1000' }],
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('does not break the PDF when the logo buffer is corrupt', async () => {
    const buf = await renderPurchaseOrderPdf({
      ...base,
      logoBuffer: Buffer.from('not a real image'),
      items: [{ lineNo: 1, sku: null, productName: 'X', unit: null, quantity: '1', unitPrice: '1000', lineSubtotal: '1000' }],
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('hides empty company fields without throwing', async () => {
    const buf = await renderPurchaseOrderPdf({
      ...base,
      company: { name: 'Tenant X', address: '', taxCode: '', phone: '' },
      reviewedByName: null,
      expectedDeliveryDate: null,
      description: null,
      items: [{ lineNo: 1, sku: null, productName: 'X', unit: null, quantity: '1', unitPrice: '1000', lineSubtotal: '1000' }],
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
