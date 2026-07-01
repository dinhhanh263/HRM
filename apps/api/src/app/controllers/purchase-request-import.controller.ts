import type { Request, Response } from 'express';
import type { ImportLang } from '@hrm/shared';
import { PR_ITEM_IMPORT_ERROR_CODES } from '@hrm/shared';
import { BadRequestError } from '../../shared/errors/index.js';
import type { ImportFileFormat } from '../../domain/purchase-request-import/purchase-request-import.parser.js';
import { buildPRItemImportTemplate } from '../../domain/purchase-request-import/purchase-request-import.template.js';
import { parsePRItemImportFile } from '../../domain/purchase-request-import/purchase-request-import.parse.service.js';

/** Normalize the `?format=` query into a supported template format (default xlsx). */
function resolveTemplateFormat(value: unknown): ImportFileFormat {
  return value === 'csv' ? 'csv' : 'xlsx';
}

/** Normalize the `?lang=` query into a supported language (default vi). */
function resolveTemplateLang(value: unknown): ImportLang {
  return value === 'en' ? 'en' : 'vi';
}

/** Infer the file format from the upload's extension, falling back to mimetype. */
function resolveUploadFormat(file: Express.Multer.File): ImportFileFormat {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv') return 'csv';
  return 'xlsx';
}

export const purchaseRequestImportController = {
  /**
   * Download a blank line-item import template (xlsx or csv) with localized
   * headers and a guidance sheet. RBAC: gated by `purchase_request:create`.
   */
  async template(req: Request, res: Response) {
    const format = resolveTemplateFormat(req.query.format);
    const lang = resolveTemplateLang(req.query.lang);
    const { buffer, filename, contentType } = await buildPRItemImportTemplate(format, lang);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  /**
   * Parse an uploaded .xlsx/.csv into line items. Pure dry-run: writes nothing,
   * touches no database, no staging. Returns the clean items inline for the
   * client to merge into the New Purchase Request form, plus a per-row error
   * report. RBAC: gated by `purchase_request:create` at the route.
   */
  async parse(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      throw new BadRequestError(
        'No file uploaded (expected field "file")',
        PR_ITEM_IMPORT_ERROR_CODES.UNREADABLE_FILE,
      );
    }

    const format = resolveUploadFormat(file);
    const result = await parsePRItemImportFile(file.buffer, format);

    res.json({ success: true, data: result });
  },
};
