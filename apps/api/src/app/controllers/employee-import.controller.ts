import type { Request, Response } from 'express';
import type { ImportOptions } from '@hrm/shared';
import { IMPORT_ERROR_CODES } from '@hrm/shared';
import type { ImportLang } from '@hrm/shared';
import { AppError, BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { validateImportFile } from '../../domain/employee-import/employee-import.validate.service.js';
import type { ImportFileFormat } from '../../domain/employee-import/employee-import.parser.js';
import { buildImportTemplate } from '../../domain/employee-import/employee-import.template.js';
import { getStagedImport } from '../../domain/employee-import/employee-import.staging.js';
import {
  enqueueImport,
  getImportJobStatus,
} from '../../domain/employee-import/employee-import.queue.js';

/** Infer the file format from the upload's extension, falling back to mimetype. */
function resolveFormat(file: Express.Multer.File): ImportFileFormat {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv') return 'csv';
  return 'xlsx';
}

/** Parse multipart text fields into typed, defaulted import options. */
function resolveOptions(body: Record<string, unknown>): ImportOptions {
  // multipart values arrive as strings; treat only explicit 'false' as false.
  const autoCreateOrgUnits = body.autoCreateOrgUnits !== 'false' && body.autoCreateOrgUnits !== false;
  return { autoCreateOrgUnits, duplicateMode: 'skip' };
}

/** Normalize the `?format=` query into a supported template format (default xlsx). */
function resolveTemplateFormat(value: unknown): ImportFileFormat {
  return value === 'csv' ? 'csv' : 'xlsx';
}

/** Normalize the `?lang=` query into a supported language (default vi). */
function resolveTemplateLang(value: unknown): ImportLang {
  return value === 'en' ? 'en' : 'vi';
}

export const employeeImportController = {
  /**
   * Download a blank import template (xlsx or csv) with localized headers. The
   * .xlsx variant carries dropdowns for the enum columns and a guidance sheet.
   * RBAC: gated by `employees:import` at the route.
   */
  async template(req: Request, res: Response) {
    const format = resolveTemplateFormat(req.query.format);
    const lang = resolveTemplateLang(req.query.lang);
    const { buffer, filename, contentType } = await buildImportTemplate(format, lang);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  async validate(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const file = req.file;
    if (!file) {
      throw new BadRequestError('No file uploaded (expected field "file")', IMPORT_ERROR_CODES.UNREADABLE_FILE);
    }

    const format = resolveFormat(file);
    const options = resolveOptions(req.body ?? {});
    const summary = await validateImportFile(tenantId, file.buffer, format, options);

    res.json({ success: true, data: summary });
  },

  /**
   * Confirm a staged import: verify the importId still exists for this tenant,
   * then enqueue a background job. Responds 202 with the job id; the wizard polls
   * `GET /import/:jobId` for progress and the final report.
   */
  async enqueue(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const importId = req.body?.importId as string | undefined;
    if (!importId) {
      throw new BadRequestError('importId is required', IMPORT_ERROR_CODES.STAGING_NOT_FOUND);
    }

    // Cross-tenant + expiry guard happens inside getStagedImport.
    const staged = await getStagedImport(importId, tenantId);
    if (!staged) {
      throw new AppError(
        'Staged import not found or expired; please re-validate the file',
        404,
        IMPORT_ERROR_CODES.STAGING_NOT_FOUND,
      );
    }

    const jobId = await enqueueImport({ importId, tenantId });

    res.status(202).json({
      success: true,
      data: { jobId, state: 'waiting', progress: null, result: null },
    });
  },

  /** Poll an import job's lifecycle state, live progress, and final result. */
  async status(req: Request, res: Response) {
    const jobId = req.params.jobId;
    const tenantId = req.user!.tenantId;
    const status = await getImportJobStatus(jobId, tenantId);
    if (!status) {
      throw new NotFoundError('Import job not found');
    }
    res.json({ success: true, data: status });
  },
};
