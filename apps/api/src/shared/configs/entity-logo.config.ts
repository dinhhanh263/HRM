// SPEC-043: limits + storage config cho logo pháp nhân phát hành (IssuingEntity).
// pdfkit `doc.image` CHỈ đọc PNG/JPEG (không WebP/SVG) → cố tình bỏ WebP/PDF so
// với purchase.config. Tái dùng env chung của tầng storage (STORAGE_DRIVER,
// GCS_BUCKET, GCP_PROJECT_ID).

/** Kích thước tối đa logo (2 MB). */
export const ENTITY_LOGO_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** MIME chấp nhận: CHỈ PNG/JPEG (pdfkit nhúng được). */
export const ENTITY_LOGO_ALLOWED_MIME: { mime: string; ext: string }[] = [
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/jpeg', ext: '.jpg' },
];

/** Thư mục đĩa local khi STORAGE_DRIVER=local. */
export const ENTITY_LOGO_STORAGE_DIR = process.env.ENTITY_LOGO_STORAGE_DIR || 'storage/entity-logo';

/** Prefix URL mọi logoUrl mang theo (`/uploads/entity-logo/<uuid>.<ext>`); với gcs
 *  map sang object key `entity-logo/<uuid>.<ext>` — backend-agnostic, không migrate. */
export const ENTITY_LOGO_URL_PREFIX = '/uploads/entity-logo';
