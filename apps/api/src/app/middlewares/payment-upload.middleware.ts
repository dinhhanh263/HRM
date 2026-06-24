import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../shared/errors/index.js';
import { PAYMENT_ALLOWED_MIME, PAYMENT_MAX_FILE_BYTES } from '../../shared/configs/payment.config.js';

// In-memory: the buffer is handed straight to the storage backend. Files are
// capped at 10 MB so holding one in memory is safe.
const storage = multer.memoryStorage();
const allowedMime = new Set(PAYMENT_ALLOWED_MIME.map((a) => a.mime));

const upload = multer({
  storage,
  limits: { fileSize: PAYMENT_MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Chỉ chấp nhận ảnh (JPG/PNG/WEBP) hoặc PDF', 'PAYMENT_UNSUPPORTED_TYPE'));
    }
  },
});

/**
 * Accept a single attachment under the `file` field. The per-request count is 1;
 * the per-attachment file count cap (PAYMENT_MAX_FILES) is enforced in the service
 * against existing attachments. Translates multer errors into standard codes.
 */
export function uploadPaymentFile() {
  const single = upload.single('file');
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('Tệp vượt quá dung lượng cho phép (tối đa 10MB)', 'PAYMENT_FILE_TOO_LARGE'));
        }
        return next(new BadRequestError(err.message, 'PAYMENT_UPLOAD_ERROR'));
      }
      if (err) return next(err);
      next();
    });
  };
}
