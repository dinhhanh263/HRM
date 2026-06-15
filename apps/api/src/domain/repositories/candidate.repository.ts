import { Prisma } from '@prisma/client';
import type { CandidateSource, Gender } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { ConflictError } from '../../shared/errors/AppError.js';

// Map a Prisma unique-violation (P2002) on the candidate table to a typed
// ConflictError. The DB indexes are the race-safe backstop behind the service's
// read-time dedupe checks, so a concurrent insert that slips past them surfaces
// here. We distinguish email vs phone from the violated index/target.
function rethrowCandidateConflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = err.meta?.target;
    const hint = Array.isArray(target) ? target.join(',') : String(target ?? '');
    if (hint.includes('phone')) {
      throw new ConflictError(
        'Đã tồn tại ứng viên với số điện thoại này',
        'CANDIDATE_DUPLICATE_PHONE'
      );
    }
    if (hint.includes('email')) {
      throw new ConflictError('Đã tồn tại ứng viên với email này', 'CANDIDATE_DUPLICATE_EMAIL');
    }
    throw new ConflictError('Ứng viên đã tồn tại', 'CANDIDATE_DUPLICATE');
  }
  throw err;
}

export interface CandidateListFilters {
  search?: string;
  source?: CandidateSource;
  skills?: string[];
  minExp?: number;
  page: number;
  limit: number;
}

export interface CreateCandidateData {
  tenantId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  totalYearsExp?: number | null;
  source: CandidateSource;
  links?: Prisma.InputJsonValue | null;
  dateOfBirth?: Date | null;
  gender?: Gender | null;
  skills: string[];
  consentGivenAt?: Date | null;
  consentSource?: string | null;
  retentionUntil?: Date | null;
}

export interface UpdateCandidateData {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  totalYearsExp?: number | null;
  source?: CandidateSource;
  links?: Prisma.InputJsonValue | null;
  dateOfBirth?: Date | null;
  gender?: Gender | null;
  skills?: string[];
  consentGivenAt?: Date | null;
  consentSource?: string | null;
  retentionUntil?: Date | null;
}

function buildLinks(links: Prisma.InputJsonValue | null | undefined) {
  if (links === undefined) return {};
  return { links: links === null ? Prisma.JsonNull : links };
}

export const candidateRepository = {
  async findAll(tenantId: string, filters: CandidateListFilters) {
    // Diacritic-insensitive search needs Postgres unaccent(), which Prisma's
    // typed query API can't express — so we resolve matching IDs via $queryRaw,
    // then re-fetch typed rows. The ID page is already createdAt-desc ordered, so
    // re-fetching that exact set with the same order reproduces it faithfully.
    const conditions: Prisma.Sql[] = [Prisma.sql`c.tenant_id = ${tenantId}`];

    if (filters.source) {
      conditions.push(Prisma.sql`c.source = ${filters.source}::"CandidateSource"`);
    }

    if (filters.search) {
      const like = `%${filters.search}%`;
      conditions.push(Prisma.sql`(
        unaccent(c.full_name) ILIKE unaccent(${like})
        OR unaccent(coalesce(c.email, '')) ILIKE unaccent(${like})
        OR coalesce(c.phone, '') ILIKE ${like}
        OR unaccent(coalesce(c.current_title, '')) ILIKE unaccent(${like})
        OR unaccent(coalesce(c.raw_cv_text, '')) ILIKE unaccent(${like})
        OR EXISTS (
          SELECT 1 FROM unnest(c.skills) sk WHERE unaccent(sk) ILIKE unaccent(${like})
        )
      )`);
    }

    // skills filter: candidate must have every requested skill (case-insensitive).
    if (filters.skills?.length) {
      for (const skill of filters.skills) {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM unnest(c.skills) sk WHERE lower(sk) = lower(${skill})
        )`);
      }
    }

    if (typeof filters.minExp === 'number') {
      conditions.push(Prisma.sql`c.total_years_exp >= ${filters.minExp}`);
    }

    const whereSql = Prisma.join(conditions, ' AND ');
    const skip = (filters.page - 1) * filters.limit;

    const [idRows, countRows] = await Promise.all([
      db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c.id FROM candidates c
        WHERE ${whereSql}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ${filters.limit} OFFSET ${skip}
      `),
      db.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT count(*)::int AS total FROM candidates c WHERE ${whereSql}
      `),
    ]);

    const ids = idRows.map((r) => r.id);
    const total = countRows[0]?.total ?? 0;
    const data = ids.length
      ? await db.candidate.findMany({
          where: { id: { in: ids } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : [];

    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  },

  async findById(id: string, tenantId: string) {
    return db.candidate.findFirst({ where: { id, tenantId } });
  },

  async findByEmail(tenantId: string, email: string) {
    return db.candidate.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
    });
  },

  // Phone is stored already E.164-normalized, so an exact match is a true match.
  async findByPhone(tenantId: string, phone: string) {
    return db.candidate.findFirst({ where: { tenantId, phone } });
  },

  // Pull the candidate set for in-memory fuzzy-name comparison. Bounded by the
  // tenant; fine for MVP volumes (full-text search arrives in Task 3.4).
  async findNameCandidates(tenantId: string) {
    return db.candidate.findMany({
      where: { tenantId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        currentTitle: true,
      },
    });
  },

  async create(data: CreateCandidateData) {
    try {
      return await db.candidate.create({
        data: {
          tenantId: data.tenantId,
          fullName: data.fullName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          location: data.location ?? null,
          currentTitle: data.currentTitle ?? null,
          totalYearsExp: data.totalYearsExp ?? null,
          source: data.source,
          ...buildLinks(data.links),
          dateOfBirth: data.dateOfBirth ?? null,
          gender: data.gender ?? null,
          skills: data.skills,
          consentGivenAt: data.consentGivenAt ?? null,
          consentSource: data.consentSource ?? null,
          retentionUntil: data.retentionUntil ?? null,
        },
      });
    } catch (err) {
      rethrowCandidateConflict(err);
    }
  },

  async update(id: string, data: UpdateCandidateData) {
    try {
      return await db.candidate.update({
        where: { id },
        data: {
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.currentTitle !== undefined ? { currentTitle: data.currentTitle } : {}),
          ...(data.totalYearsExp !== undefined ? { totalYearsExp: data.totalYearsExp } : {}),
          ...(data.source !== undefined ? { source: data.source } : {}),
          ...buildLinks(data.links),
          ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.skills !== undefined ? { skills: data.skills } : {}),
          ...(data.consentGivenAt !== undefined ? { consentGivenAt: data.consentGivenAt } : {}),
          ...(data.consentSource !== undefined ? { consentSource: data.consentSource } : {}),
          ...(data.retentionUntil !== undefined ? { retentionUntil: data.retentionUntil } : {}),
        },
      });
    } catch (err) {
      rethrowCandidateConflict(err);
    }
  },
};
