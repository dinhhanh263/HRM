import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../shared/errors/index.js';
import { IMPORT_ERROR_CODES } from '@hrm/shared';
import { IMPORT_MAX_FILE_BYTES } from '../../shared/configs/import.config.js';

// Accept only spreadsheet/csv content. Browsers and OSes are inconsistent about
// the exact mime they send for .xlsx/.csv, so we allow the common set and fall
// back to extension-based detection in the parser.
const ALLOWED_MIME = new Set<string>([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // some browsers report this for .xlsx/.csv
  'text/csv',
  'application/csv',
  'text/plain', // some clients send this for .csv
  'application/octet-stream', // generic fallback
]);

// In-memory storage: the parser needs the whole buffer (exceljs.load) and files
// are capped at 5 MB, so we never touch disk. fileSize limit is enforced here;
// exceeding it surfaces as a MulterError handled below.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Unsupported file type', IMPORT_ERROR_CODES.UNREADABLE_FILE));
    }
  },
});

/**
 * Express middleware accepting a single multipart file under the `file` field.
 * Translates multer's size-limit error into our standard BadRequestError so the
 * global error handler returns a consistent payload.
 */
export function uploadImportFile() {
  const single = upload.single('file');
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new BadRequestError('File exceeds the maximum allowed size', IMPORT_ERROR_CODES.FILE_TOO_LARGE),
          );
        }
        return next(new BadRequestError(err.message, IMPORT_ERROR_CODES.UNREADABLE_FILE));
      }
      if (err) return next(err);
      next();
    });
  };
}
