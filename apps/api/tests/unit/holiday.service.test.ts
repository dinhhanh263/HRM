import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const repoMock = {
  findByYear: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../src/domain/repositories/holiday.repository.js', () => ({
  holidayRepository: repoMock,
}));

const { holidayService } = await import('../../src/domain/services/holiday.service.js');

function makeHoliday(overrides = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'hol-1',
    tenantId: 'tenant-1',
    date: new Date('2026-04-30T00:00:00.000Z'),
    name: 'Giải phóng miền Nam',
    recurring: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('holidayService.listByYear', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should default to the current year when none is given', async () => {
    repoMock.findByYear.mockResolvedValue([makeHoliday()]);

    const result = await holidayService.listByYear('tenant-1');

    expect(repoMock.findByYear).toHaveBeenCalledWith('tenant-1', new Date().getUTCFullYear());
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-04-30');
  });

  it('should pass the requested year through to the repository', async () => {
    repoMock.findByYear.mockResolvedValue([]);

    await holidayService.listByYear('tenant-1', 2025);

    expect(repoMock.findByYear).toHaveBeenCalledWith('tenant-1', 2025);
  });
});

describe('holidayService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should create a holiday at UTC midnight and return a YYYY-MM-DD date', async () => {
    repoMock.create.mockResolvedValue(makeHoliday());

    const result = await holidayService.create('tenant-1', {
      date: '2026-04-30',
      name: 'Giải phóng miền Nam',
      recurring: true,
    });

    const arg = repoMock.create.mock.calls[0][0];
    expect(arg.date.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    expect(arg.tenant.connect.id).toBe('tenant-1');
    expect(result.date).toBe('2026-04-30');
  });

  it('should reject a malformed date', async () => {
    await expect(
      holidayService.create('tenant-1', { date: '30/04/2026', name: 'x' }),
    ).rejects.toThrow('date must be in YYYY-MM-DD format');
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should translate a unique-constraint violation into a friendly conflict', async () => {
    repoMock.create.mockRejectedValue(uniqueViolation());

    await expect(
      holidayService.create('tenant-1', { date: '2026-04-30', name: 'dup' }),
    ).rejects.toThrow('A holiday already exists on this date');
  });
});

describe('holidayService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject when the holiday is not in the tenant', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(
      holidayService.update('tenant-1', 'missing', { name: 'x' }),
    ).rejects.toThrow('Holiday not found');
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should update name and recurring without touching the date when omitted', async () => {
    repoMock.findById.mockResolvedValue(makeHoliday());
    repoMock.update.mockResolvedValue(makeHoliday({ name: 'Đổi tên', recurring: false }));

    const result = await holidayService.update('tenant-1', 'hol-1', {
      name: 'Đổi tên',
      recurring: false,
    });

    const data = repoMock.update.mock.calls[0][1];
    expect(data.date).toBeUndefined();
    expect(result.name).toBe('Đổi tên');
    expect(result.recurring).toBe(false);
  });
});

describe('holidayService.remove', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject when the holiday is not in the tenant', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(holidayService.remove('tenant-1', 'missing')).rejects.toThrow('Holiday not found');
    expect(repoMock.delete).not.toHaveBeenCalled();
  });

  it('should delete a holiday that belongs to the tenant', async () => {
    repoMock.findById.mockResolvedValue(makeHoliday());
    repoMock.delete.mockResolvedValue(makeHoliday());

    await holidayService.remove('tenant-1', 'hol-1');

    expect(repoMock.delete).toHaveBeenCalledWith('hol-1');
  });
});
