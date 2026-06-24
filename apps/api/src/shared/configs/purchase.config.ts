// SPEC-042: limits + storage config cho chứng từ đính kèm của Purchase Request
// (báo giá / hợp đồng / hình mẫu). Tách riêng với payment.config để không lẫn ràng
// buộc. Tái dùng env chung của tầng storage (STORAGE_DRIVER, GCS_BUCKET, GCP_PROJECT_ID).

/** Kích thước tối đa mỗi file đính kèm (10 MB). */
export const PURCHASE_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Số file đính kèm tối đa cho một phiếu. */
export const PURCHASE_MAX_FILES = 10;

/** MIME chấp nhận: ảnh báo giá/mẫu + PDF. */
export const PURCHASE_ALLOWED_MIME: { mime: string; ext: string }[] = [
  { mime: 'image/jpeg', ext: '.jpg' },
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/webp', ext: '.webp' },
  { mime: 'application/pdf', ext: '.pdf' },
];

/** Thư mục đĩa local khi STORAGE_DRIVER=local. */
export const PURCHASE_STORAGE_DIR = process.env.PURCHASE_STORAGE_DIR || 'storage/purchase';

/** Prefix URL mọi fileUrl mang theo (`/uploads/purchase/<uuid>.<ext>`); với gcs
 *  map sang object key `purchase/<uuid>.<ext>` — backend-agnostic, không cần migrate. */
export const PURCHASE_URL_PREFIX = '/uploads/purchase';
