import type { Request, Response } from 'express';
import type { CashTxImportLang } from '@hrm/shared';
import { BadRequestError } from '../../shared/errors/index.js';
import type { ImportFileFormat } from '../../domain/cash-transaction-import/cash-transaction-import.parser.js';
import { buildCashTxImportTemplate } from '../../domain/cash-transaction-import/cash-transaction-import.template.js';
import { cashTransactionImportService } from '../../domain/cash-transaction-import/cash-transaction-import.service.js';

function resolveTemplateFormat(value: unknown): ImportFileFormat {
  return value === 'csv' ? 'csv' : 'xlsx';
}
function resolveTemplateLang(value: unknown): CashTxImportLang {
  return value === 'en' ? 'en' : 'vi';
}
function resolveUploadFormat(file: Express.Multer.File): ImportFileFormat {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv') return 'csv';
  return 'xlsx';
}

export const cashTransactionImportController = {
  async template(req: Request, res: Response) {
    const format = resolveTemplateFormat(req.query.format);
    const lang = resolveTemplateLang(req.query.lang);
    const { buffer, filename, contentType } = await buildCashTxImportTemplate(format, lang);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  async parse(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw new BadRequestError('Chưa có tệp (trường "file")', 'UNREADABLE_FILE');
    const tenantId = req.user!.tenantId;
    const result = await cashTransactionImportService.parse(tenantId, file.buffer, resolveUploadFormat(file));
    res.json({ success: true, data: result });
  },

  async confirm(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw new BadRequestError('Chưa có tệp (trường "file")', 'UNREADABLE_FILE');
    const tenantId = req.user!.tenantId;
    const userId = req.user!.sub;
    const result = await cashTransactionImportService.confirm(tenantId, userId, file.buffer, resolveUploadFormat(file));
    res.status(201).json({ success: true, data: result });
  },
};
