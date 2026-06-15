import type { Request, Response } from 'express';
import type { CandidateSource } from '@prisma/client';
import { candidateService } from '../../domain/services/candidate.service.js';
import { candidateAttachmentService } from '../../domain/services/candidate-attachment.service.js';
import type { CandidateListFilters } from '../../domain/repositories/candidate.repository.js';
import { BadRequestError } from '../../shared/errors/index.js';

const CANDIDATE_SOURCES: CandidateSource[] = [
  'CAREER_SITE',
  'JOB_BOARD',
  'REFERRAL',
  'SOURCED',
  'AGENCY',
  'EVENT',
  'DIRECT',
];

// Accept skills as a comma-separated string (?skills=node,react) or repeated
// params (?skills=node&skills=react); dedupe and drop blanks.
function parseSkills(raw: unknown): string[] {
  const parts: string[] = [];
  if (typeof raw === 'string') {
    parts.push(...raw.split(','));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') parts.push(...item.split(','));
    }
  }
  const cleaned = parts.map((s) => s.trim()).filter(Boolean);
  return [...new Set(cleaned)];
}

function parseFilters(query: Request['query']): CandidateListFilters {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '20'), 10) || 20));
  const filters: CandidateListFilters = { page, limit };
  if (typeof query.search === 'string' && query.search.trim()) {
    filters.search = query.search.trim();
  }
  if (
    typeof query.source === 'string' &&
    CANDIDATE_SOURCES.includes(query.source as CandidateSource)
  ) {
    filters.source = query.source as CandidateSource;
  }
  const skills = parseSkills(query.skills);
  if (skills.length) filters.skills = skills;
  if (query.minExp !== undefined) {
    const minExp = Number.parseFloat(String(query.minExp));
    if (Number.isFinite(minExp) && minExp >= 0) filters.minExp = minExp;
  }
  return filters;
}

export const candidateController = {
  async getAll(req: Request, res: Response) {
    const { data, pagination } = await candidateService.getAll(
      req.user!.tenantId,
      parseFilters(req.query)
    );
    res.json({ success: true, data, pagination });
  },

  async getById(req: Request, res: Response) {
    const data = await candidateService.getById(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async create(req: Request, res: Response) {
    const data = await candidateService.create(req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const data = await candidateService.update(req.params.id, req.user!.tenantId, req.body);
    res.json({ success: true, data });
  },

  async listAttachments(req: Request, res: Response) {
    const data = await candidateAttachmentService.list(req.params.id, req.user!.tenantId);
    res.json({ success: true, data });
  },

  async uploadAttachment(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      throw new BadRequestError('Chưa có tệp nào được tải lên (trường "file")', 'CV_NO_FILE');
    }
    const data = await candidateAttachmentService.upload(req.params.id, req.user!.tenantId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    res.status(201).json({ success: true, data });
  },

  async downloadAttachment(req: Request, res: Response) {
    const { diskPath, fileName } = await candidateAttachmentService.getDownload(
      req.params.attachmentId,
      req.params.id,
      req.user!.tenantId
    );
    res.download(diskPath, fileName);
  },

  async reparseAttachment(req: Request, res: Response) {
    const data = await candidateAttachmentService.reparse(
      req.params.attachmentId,
      req.params.id,
      req.user!.tenantId
    );
    res.json({ success: true, data });
  },
};
