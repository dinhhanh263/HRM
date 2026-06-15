import type { Candidate, CandidateSource, Gender, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import {
  candidateRepository,
  type CandidateListFilters,
} from '../repositories/candidate.repository.js';
import { normalizePhone, normalizeName } from '../recruitment/candidate-normalize.js';

interface CreateCandidateInput {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  totalYearsExp?: number;
  source?: CandidateSource;
  links?: Prisma.InputJsonValue;
  dateOfBirth?: string;
  gender?: Gender;
  skills?: string[];
  consentGivenAt?: string;
  consentSource?: string;
  retentionUntil?: string;
  force?: boolean;
}

interface UpdateCandidateInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  totalYearsExp?: number | null;
  source?: CandidateSource;
  links?: Prisma.InputJsonValue | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  skills?: string[];
  consentGivenAt?: string | null;
  consentSource?: string | null;
  retentionUntil?: string | null;
}

type NameMatchRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
};

function toListDto(c: Candidate) {
  return {
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    location: c.location,
    currentTitle: c.currentTitle,
    totalYearsExp: c.totalYearsExp,
    source: c.source,
    avatar: c.avatar,
    skills: c.skills,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDetailDto(c: Candidate) {
  return {
    ...toListDto(c),
    tenantId: c.tenantId,
    dateOfBirth: c.dateOfBirth?.toISOString() ?? null,
    gender: c.gender,
    links: (c.links as Record<string, string> | null) ?? null,
    consentGivenAt: c.consentGivenAt?.toISOString() ?? null,
    consentSource: c.consentSource,
    retentionUntil: c.retentionUntil?.toISOString() ?? null,
  };
}

function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return new Date(v);
}

export const candidateService = {
  async getAll(tenantId: string, filters: CandidateListFilters) {
    const result = await candidateRepository.findAll(tenantId, filters);
    return { data: result.data.map(toListDto), pagination: result.pagination };
  },

  async getById(id: string, tenantId: string) {
    const candidate = await candidateRepository.findById(id, tenantId);
    if (!candidate) throw new NotFoundError('Candidate not found');
    return toDetailDto(candidate);
  },

  async create(tenantId: string, input: CreateCandidateInput) {
    // Lowercase email so the DB unique (tenant_id, email) is the authoritative
    // dedupe guard: the read-time findByEmail is case-insensitive, but a plain
    // case-sensitive unique would let two case-variant rows race past it.
    const email = input.email?.trim().toLowerCase() || null;
    const phone = normalizePhone(input.phone);

    // Hard blocks: an exact email or normalized-phone match is the same person.
    if (email) {
      const byEmail = await candidateRepository.findByEmail(tenantId, email);
      if (byEmail) {
        throw new ConflictError('Đã tồn tại ứng viên với email này', 'CANDIDATE_DUPLICATE_EMAIL');
      }
    }
    if (phone) {
      const byPhone = await candidateRepository.findByPhone(tenantId, phone);
      if (byPhone) {
        throw new ConflictError(
          'Đã tồn tại ứng viên với số điện thoại này',
          'CANDIDATE_DUPLICATE_PHONE'
        );
      }
    }

    // Soft block: a same-name match (diacritic-insensitive) is only a warning the
    // recruiter can override with force, since names legitimately repeat.
    if (!input.force) {
      const key = normalizeName(input.fullName);
      const all = (await candidateRepository.findNameCandidates(tenantId)) as NameMatchRow[];
      const matches = all.filter((c) => normalizeName(c.fullName) === key);
      if (matches.length > 0) {
        throw new ConflictError(
          'Có thể trùng với ứng viên đã tồn tại',
          'CANDIDATE_POSSIBLE_DUPLICATE',
          { matches }
        );
      }
    }

    const created = await candidateRepository.create({
      tenantId,
      fullName: input.fullName.trim(),
      email,
      phone,
      location: input.location ?? null,
      currentTitle: input.currentTitle ?? null,
      totalYearsExp: input.totalYearsExp ?? null,
      source: input.source ?? 'DIRECT',
      links: input.links ?? null,
      dateOfBirth: parseDate(input.dateOfBirth) ?? null,
      gender: input.gender ?? null,
      skills: input.skills ?? [],
      consentGivenAt: parseDate(input.consentGivenAt) ?? null,
      consentSource: input.consentSource ?? null,
      retentionUntil: parseDate(input.retentionUntil) ?? null,
    });
    return toDetailDto(created);
  },

  async update(id: string, tenantId: string, input: UpdateCandidateInput) {
    const existing = await candidateRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Candidate not found');

    const data: Parameters<typeof candidateRepository.update>[1] = {};

    if (input.email !== undefined) {
      const email = input.email?.trim().toLowerCase() || null;
      if (email) {
        const byEmail = await candidateRepository.findByEmail(tenantId, email);
        if (byEmail && byEmail.id !== id) {
          throw new ConflictError('Đã tồn tại ứng viên với email này', 'CANDIDATE_DUPLICATE_EMAIL');
        }
      }
      data.email = email;
    }

    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone);
      if (phone) {
        const byPhone = await candidateRepository.findByPhone(tenantId, phone);
        if (byPhone && byPhone.id !== id) {
          throw new ConflictError(
            'Đã tồn tại ứng viên với số điện thoại này',
            'CANDIDATE_DUPLICATE_PHONE'
          );
        }
      }
      data.phone = phone;
    }

    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.location !== undefined) data.location = input.location;
    if (input.currentTitle !== undefined) data.currentTitle = input.currentTitle;
    if (input.totalYearsExp !== undefined) data.totalYearsExp = input.totalYearsExp;
    if (input.source !== undefined) data.source = input.source;
    if (input.links !== undefined) data.links = input.links;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.skills !== undefined) data.skills = input.skills;
    if (input.consentSource !== undefined) data.consentSource = input.consentSource;
    if (input.dateOfBirth !== undefined) data.dateOfBirth = parseDate(input.dateOfBirth);
    if (input.consentGivenAt !== undefined) data.consentGivenAt = parseDate(input.consentGivenAt);
    if (input.retentionUntil !== undefined) data.retentionUntil = parseDate(input.retentionUntil);

    const updated = await candidateRepository.update(id, data);
    return toDetailDto(updated);
  },
};
