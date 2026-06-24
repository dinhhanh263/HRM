// SPEC-041: limits + storage config cho chứng từ đính kèm của Payment Request
// (hoá đơn đỏ / bill). Tách riêng với cv.config để không lẫn ràng buộc CV.
// Tái dùng env chung của tầng storage (STORAGE_DRIVER, GCS_BUCKET, GCP_PROJECT_ID).

/** Kích thước tối đa mỗi file đính kèm (10 MB). */
export const PAYMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Số file đính kèm tối đa cho một đơn. */
export const PAYMENT_MAX_FILES = 10;

/** MIME chấp nhận: ảnh hoá đơn/bill + PDF. */
export const PAYMENT_ALLOWED_MIME: { mime: string; ext: string }[] = [
  { mime: 'image/jpeg', ext: '.jpg' },
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/webp', ext: '.webp' },
  { mime: 'application/pdf', ext: '.pdf' },
];

/** Thư mục đĩa local khi STORAGE_DRIVER=local. */
export const PAYMENT_STORAGE_DIR = process.env.PAYMENT_STORAGE_DIR || 'storage/payment';

/** Prefix URL mọi fileUrl mang theo (`/uploads/payment/<uuid>.<ext>`); với gcs
 *  map sang object key `payment/<uuid>.<ext>` — backend-agnostic, không cần migrate. */
export const PAYMENT_URL_PREFIX = '/uploads/payment';
