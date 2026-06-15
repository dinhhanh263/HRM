import type { Request, Response } from 'express';
import type { ImportLang } from '@hrm/shared';
import { ASSET_IMPORT_ERROR_CODES } from '@hrm/shared';
import { BadRequestError } from '../../shared/errors/index.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import type { ImportFileFormat } from '../../domain/asset-import/asset-import.parser.js';
import { buildAssetImportTemplate } from '../../domain/asset-import/asset-import.template.js';
import { validateAssetImportFile } from '../../domain/asset-import/asset-import.validate.service.js';
import { confirmAssetImport } from '../../domain/asset-import/asset-import.import.service.js';

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

export const assetImportController = {
  /**
   * Download a blank asset-import template (xlsx or csv) with localized headers.
   * The .xlsx variant carries a dropdown for the condition column and a guidance
   * sheet. RBAC: gated by `assets:import` at the route.
   */
  async template(req: Request, res: Response) {
    const format = resolveTemplateFormat(req.query.format);
    const lang = resolveTemplateLang(req.query.lang);
    const { buffer, filename, contentType } = await buildAssetImportTemplate(format, lang);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  /**
   * Dry-run validate an uploaded .xlsx/.csv. Writes nothing; returns a per-row
   * preview with inline errors. On a fully-clean file the validated rows are
   * staged in Redis and `importId` is returned for the atomic confirm step.
   * RBAC: gated by `assets:import` at the route.
   */
  async validate(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const file = req.file;
    if (!file) {
      throw new BadRequestError(
        'No file uploaded (expected field "file")',
        ASSET_IMPORT_ERROR_CODES.UNREADABLE_FILE,
      );
    }

    const format = resolveUploadFormat(file);
    const summary = await validateAssetImportFile(tenantId, file.buffer, format);

    res.json({ success: true, data: summary });
  },

  /**
   * Commit a previously-validated import (referenced by `importId`) atomically.
   * Creates every Asset plus an ACTIVE handover for each owner row in a single
   * transaction — all-or-nothing. The acting user's employee id (if any) becomes
   * the handover `assignedById`; it is only required when the file has owner
   * rows. RBAC: gated by `assets:import` at the route.
   */
  async confirm(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const importId = req.body?.importId;
    if (typeof importId !== 'string' || importId.length === 0) {
      throw new BadRequestError('Missing importId', ASSET_IMPORT_ERROR_CODES.MISSING_IMPORT_ID);
    }

    // Owner rows record a handover (assignedById → Employee). Resolve the acting
    // user's employee profile if they have one; the service rejects only when an
    // owner row needs it but none exists.
    const employee = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const result = await confirmAssetImport(tenantId, importId, employee?.id ?? null);

    res.json({ success: true, data: result });
  },
};
