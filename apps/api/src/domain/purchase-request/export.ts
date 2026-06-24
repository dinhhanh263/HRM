import ExcelJS from 'exceljs';
import type { PurchaseRequestDto, PurchaseRequestStatus } from '@hrm/shared';

// Vietnamese labels for the export (server-side; mirrors the on-screen labels).
const STATUS_LABEL: Record<PurchaseRequestStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  RETURNED: 'Trả về sửa lại',
  CANCELLED: 'Đã huỷ',
  ORDERED: 'Đã đặt hàng',
};

function dmy(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * Render filtered purchase requests as an .xlsx workbook. One summary row per
 * request; subtotal/VAT/total are real numbers so Excel can sum/sort them, and a
 * TOTAL row closes the sheet.
 */
export async function buildPurchaseExportWorkbook(rows: PurchaseRequestDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Đề xuất mua hàng');

  sheet.columns = [
    { header: 'Mã', key: 'code', width: 18 },
    { header: 'Ngày tạo', key: 'createdAt', width: 12 },
    { header: 'Tiêu đề', key: 'title', width: 32 },
    { header: 'Người YC', key: 'employee', width: 22 },
    { header: 'Mã NV', key: 'empCode', width: 12 },
    { header: 'Phòng ban', key: 'department', width: 18 },
    { header: 'Nhà cung cấp', key: 'vendorName', width: 22 },
    { header: 'Ngày giao DK', key: 'expectedDeliveryDate', width: 14 },
    { header: 'Số dòng hàng', key: 'itemCount', width: 12 },
    { header: 'Subtotal', key: 'subtotal', width: 16 },
    { header: 'VAT', key: 'taxAmount', width: 14 },
    { header: 'Tổng', key: 'totalAmount', width: 16 },
    { header: 'Tiền tệ', key: 'currency', width: 8 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Người duyệt cuối', key: 'reviewedBy', width: 20 },
    { header: 'Ngày đặt hàng', key: 'orderedAt', width: 14 },
    { header: 'Ghi chú đặt hàng', key: 'orderNote', width: 26 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };

  for (const r of rows) {
    sheet.addRow({
      code: r.code,
      createdAt: dmy(r.createdAt),
      title: r.title,
      employee: r.employee?.fullName ?? '',
      empCode: r.employee?.employeeCode ?? '',
      department: r.employee?.departmentName ?? '',
      vendorName: r.vendorName,
      expectedDeliveryDate: dmy(r.expectedDeliveryDate),
      itemCount: r.items?.length ?? 0,
      subtotal: Number(r.subtotal),
      taxAmount: Number(r.taxAmount),
      totalAmount: Number(r.totalAmount),
      currency: r.currency,
      status: STATUS_LABEL[r.status],
      reviewedBy: r.reviewedBy?.fullName ?? '',
      orderedAt: dmy(r.orderedAt),
      orderNote: r.orderNote ?? '',
    });
  }

  // Number format + right align for the money columns (subtotal=10, VAT=11, total=12).
  for (const colIdx of [10, 11, 12]) {
    const col = sheet.getColumn(colIdx);
    col.numFmt = '#,##0';
    col.alignment = { horizontal: 'right' };
  }

  // TOTAL row.
  const sumSubtotal = rows.reduce((s, r) => s + Number(r.subtotal), 0);
  const sumTax = rows.reduce((s, r) => s + Number(r.taxAmount), 0);
  const sumTotal = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
  const totalRow = sheet.addRow({
    title: 'TỔNG CỘNG',
    subtotal: sumSubtotal,
    taxAmount: sumTax,
    totalAmount: sumTotal,
  });
  totalRow.font = { bold: true };
  for (const colIdx of [10, 11, 12]) {
    totalRow.getCell(colIdx).numFmt = '#,##0';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
