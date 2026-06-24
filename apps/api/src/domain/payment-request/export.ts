import ExcelJS from 'exceljs';
import type { PaymentRequestDto, PaymentRequestStatus, PaymentRequestType } from '@hrm/shared';

// Vietnamese labels for the export (server-side; mirrors the on-screen labels).
const TYPE_LABEL: Record<PaymentRequestType, string> = {
  REIMBURSEMENT: 'Hoàn ứng',
  ADVANCE: 'Tạm ứng',
  VENDOR_PAYMENT: 'Thanh toán NCC',
};
const STATUS_LABEL: Record<PaymentRequestStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  RETURNED: 'Trả về sửa lại',
  CANCELLED: 'Đã huỷ',
  PAID: 'Đã thanh toán',
};

function dmy(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * Render filtered payment requests as an .xlsx workbook. One row per request,
 * columns mirror the fields HR cares about; the amount column is a real number
 * so Excel can sum/sort it, and a TOTAL row closes the sheet.
 */
export async function buildPaymentExportWorkbook(rows: PaymentRequestDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Yêu cầu thanh toán');

  sheet.columns = [
    { header: 'Ngày tạo', key: 'createdAt', width: 12 },
    { header: 'Loại', key: 'type', width: 16 },
    { header: 'Tiêu đề', key: 'title', width: 36 },
    { header: 'Người tạo', key: 'employee', width: 22 },
    { header: 'Mã NV', key: 'code', width: 12 },
    { header: 'Phòng ban', key: 'department', width: 18 },
    { header: 'Số tiền', key: 'amount', width: 16 },
    { header: 'Tiền tệ', key: 'currency', width: 8 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Ngày chi', key: 'expenseDate', width: 12 },
    { header: 'Nhà cung cấp', key: 'vendorName', width: 20 },
    { header: 'Số hoá đơn', key: 'invoiceNumber', width: 14 },
    { header: 'Người duyệt cuối', key: 'reviewedBy', width: 20 },
    { header: 'Ngày thanh toán', key: 'paidAt', width: 14 },
    { header: 'Ghi chú thanh toán', key: 'paymentNote', width: 28 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };

  for (const r of rows) {
    sheet.addRow({
      createdAt: dmy(r.createdAt),
      type: TYPE_LABEL[r.type],
      title: r.title,
      employee: r.employee?.fullName ?? '',
      code: r.employee?.employeeCode ?? '',
      department: r.employee?.departmentName ?? '',
      amount: Number(r.amount),
      currency: r.currency,
      status: STATUS_LABEL[r.status],
      expenseDate: dmy(r.expenseDate),
      vendorName: r.vendorName ?? '',
      invoiceNumber: r.invoiceNumber ?? '',
      reviewedBy: r.reviewedBy?.fullName ?? '',
      paidAt: dmy(r.paidAt),
      paymentNote: r.paymentNote ?? '',
    });
  }

  // Number format + right align for the amount column (col 7).
  const amountCol = sheet.getColumn(7);
  amountCol.numFmt = '#,##0';
  amountCol.alignment = { horizontal: 'right' };

  // TOTAL row.
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalRow = sheet.addRow({ title: 'TỔNG CỘNG', amount: total });
  totalRow.font = { bold: true };
  totalRow.getCell(7).numFmt = '#,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
