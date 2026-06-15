import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BULK_IMPORT_MAX_FILES } from '@hrm/shared';
import { BadRequestError } from '../../shared/errors/index.js';
import { CV_ALLOWED_MIME, CV_MAX_FILE_BYTES } from '../../shared/configs/cv.config.js';

// In-memory storage: the buffer is needed both for text extraction and for
// writing to the storage backend. Files are capped at 10 MB so this is safe.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: CV_MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (CV_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Chỉ chấp nhận tệp PDF hoặc DOCX', 'CV_UNSUPPORTED_TYPE'));
    }
  },
});

/**
 * Express middleware accepting a single CV file under the `file` field.
 * Translates multer's size-limit error into our standard BadRequestError.
 */
export function uploadCvFile() {
  const single = upload.single('file');
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('Tệp vượt quá dung lượng cho phép', 'CV_FILE_TOO_LARGE'));
        }
        return next(new BadRequestError(err.message, 'CV_UPLOAD_ERROR'));
      }
      if (err) return next(err);
      next();
    });
  };
}

// Bulk upload: a multer instance that accepts many files under `files`, each
// capped at the same per-file size as a single CV. The total count is bounded so
// a runaway drag-drop can't open an unbounded number of file handles.
const bulkUpload = multer({
  storage,
  limits: { fileSize: CV_MAX_FILE_BYTES, files: BULK_IMPORT_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (CV_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Chỉ chấp nhận tệp PDF hoặc DOCX', 'CV_UNSUPPORTED_TYPE'));
    }
  },
});

/**
 * Express middleware accepting up to BULK_IMPORT_MAX_FILES CVs under the `files`
 * field. Translates multer's size/count limits into our standard errors so the
 * client gets an actionable code instead of a generic 500.
 */
export function uploadCvFiles() {
  const many = bulkUpload.array('files', BULK_IMPORT_MAX_FILES);
  return (req: Request, res: Response, next: NextFunction) => {
    many(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('Tệp vượt quá dung lượng cho phép', 'CV_FILE_TOO_LARGE'));
        }
        // Exceeding `.array` maxCount surfaces as LIMIT_UNEXPECTED_FILE.
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new BadRequestError(
              `Tối đa ${BULK_IMPORT_MAX_FILES} tệp mỗi lần tải lên`,
              'BULK_IMPORT_TOO_MANY_FILES'
            )
          );
        }
        return next(new BadRequestError(err.message, 'CV_UPLOAD_ERROR'));
      }
      if (err) return next(err);
      next();
    });
  };
}
