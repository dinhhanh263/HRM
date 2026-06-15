import { Prisma } from '@prisma/client';
import { holidayRepository } from '../repositories/holiday.repository.js';
import { toHolidayDto } from '../timesheet/mappers.js';
import { seedHolidaysForTenant } from '../timesheet/holiday-defaults.js';
import { db } from '../../infrastructure/database/client.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { HolidayDto, SeedHolidaysResult } from '@hrm/shared';

export interface CreateHolidayInput {
  date: string;
  name: string;
  recurring?: boolean;
}

export interface UpdateHolidayInput {
  date?: string;
  name?: string;
  recurring?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parse a YYYY-MM-DD string into a UTC-midnight Date so the stored @db.Date is
// stable regardless of server timezone. Throws on malformed or impossible dates.
function parseDateOnly(value: string): Date {
  if (!DATE_RE.test(value)) {
    throw new BadRequestError('date must be in YYYY-MM-DD format');
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new BadRequestError('date must be a valid calendar date');
  }
  return d;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export const holidayService = {
  async listByYear(tenantId: string, year?: number): Promise<HolidayDto[]> {
    const target = year ?? new Date().getUTCFullYear();
    const rows = await holidayRepository.findByYear(tenantId, target);
    return rows.map(toHolidayDto);
  },

  async create(tenantId: string, input: CreateHolidayInput): Promise<HolidayDto> {
    const date = parseDateOnly(input.date);
    try {
      const created = await holidayRepository.create({
        tenant: { connect: { id: tenantId } },
        date,
        name: input.name,
        recurring: input.recurring ?? false,
      });
      return toHolidayDto(created);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictError('A holiday already exists on this date');
      }
      throw e;
    }
  },

  async update(tenantId: string, id: string, input: UpdateHolidayInput): Promise<HolidayDto> {
    const existing = await holidayRepository.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Holiday not found');
    }
    try {
      const updated = await holidayRepository.update(id, {
        date: input.date !== undefined ? parseDateOnly(input.date) : undefined,
        name: input.name,
        recurring: input.recurring,
      });
      return toHolidayDto(updated);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictError('A holiday already exists on this date');
      }
      throw e;
    }
  },

  async remove(tenantId: string, id: string): Promise<void> {
    const existing = await holidayRepository.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Holiday not found');
    }
    await holidayRepository.delete(id);
  },

  async seed(tenantId: string, year: number): Promise<SeedHolidaysResult> {
    const { seeded, lunarCovered } = await seedHolidaysForTenant(db, tenantId, year);
    return { year, seeded, lunarCovered };
  },
};
