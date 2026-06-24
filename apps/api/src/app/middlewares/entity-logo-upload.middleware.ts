import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../shared/errors/index.js';
import {
  ENTITY_LOGO_ALLOWED_MIME,
  ENTITY_LOGO_MAX_FILE_BYTES,
} from '../../shared/configs/entity-logo.config.js';

// In-memory: the buffer is handed straight to the storage backend. Logos are
// capped at 2 MB so holding one in memory is safe.
const storage = multer.memoryStorage();
const allowedMime = new Set(ENTITY_LOGO_ALLOWED_MIME.map((a) => a.mime));

const upload = multer({
  storage,
  limits: { fileSize: ENTITY_LOGO_MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Chỉ chấp nhận ảnh PNG hoặc JPEG', 'ENTITY_LOGO_UNSUPPORTED_TYPE'));
    }
  },
});

/**
 * Accept a single logo image under the `file` field (PNG/JPEG, ≤2MB). Translates
 * multer errors into standard codes.
 */
export function uploadEntityLogo() {
  const single = upload.single('file');
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('Logo vượt quá dung lượng cho phép (tối đa 2MB)', 'ENTITY_LOGO_TOO_LARGE'));
        }
        return next(new BadRequestError(err.message, 'ENTITY_LOGO_UPLOAD_ERROR'));
      }
      if (err) return next(err);
      next();
    });
  };
}
