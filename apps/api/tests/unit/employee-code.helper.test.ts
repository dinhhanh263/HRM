import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma client so allocateEmployeeCodeBlock can be exercised without a
// real database. employee.findMany is included so the test can assert it is
// NEVER called — the max must be computed DB-side via $queryRaw, not by loading
// every row into memory.
const dbMock = {
  $queryRaw: vi.fn(),
  employee: { findMany: vi.fn(), findFirst: vi.fn() },
};
vi.mock('../../src/infrastructure/database/client.js', () => ({ db: dbMock }));

const {
  formatEmployeeCode,
  parseEmployeeCodeNumber,
  buildEmployeeCodeBlock,
  allocateEmployeeCodeBlock,
  generateEmployeeCode,
} = await import('../../src/shared/helpers/employee-code.helper.js');

describe('formatEmployeeCode', () => {
  it('should zero-pad to at least three digits', () => {
    expect(formatEmployeeCode(1)).toBe('EMP-001');
    expect(formatEmployeeCode(42)).toBe('EMP-042');
    expect(formatEmployeeCode(999)).toBe('EMP-999');
  });

  it('should not truncate sequences beyond three digits', () => {
    expect(formatEmployeeCode(1000)).toBe('EMP-1000');
    expect(formatEmployeeCode(12345)).toBe('EMP-12345');
  });
});

describe('parseEmployeeCodeNumber', () => {
  it('should extract the numeric suffix', () => {
    expect(parseEmployeeCodeNumber('EMP-001')).toBe(1);
    expect(parseEmployeeCodeNumber('EMP-1000')).toBe(1000);
  });

  it('should return 0 for a non-numeric or malformed code', () => {
    expect(parseEmployeeCodeNumber('EMP-')).toBe(0);
    expect(parseEmployeeCodeNumber('GARBAGE')).toBe(0);
    expect(parseEmployeeCodeNumber('')).toBe(0);
  });
});

describe('buildEmployeeCodeBlock', () => {
  it('should produce a contiguous block following the current maximum', () => {
    expect(buildEmployeeCodeBlock(0, 3)).toEqual(['EMP-001', 'EMP-002', 'EMP-003']);
    expect(buildEmployeeCodeBlock(41, 2)).toEqual(['EMP-042', 'EMP-043']);
  });

  it('should return an empty block when count is zero', () => {
    expect(buildEmployeeCodeBlock(10, 0)).toEqual([]);
  });

  it('should keep incrementing correctly past EMP-999 (no lexicographic break)', () => {
    expect(buildEmployeeCodeBlock(999, 2)).toEqual(['EMP-1000', 'EMP-1001']);
  });

  it('should never collide with an existing maximum', () => {
    const block = buildEmployeeCodeBlock(5, 100);
    expect(block).toHaveLength(100);
    expect(block[0]).toBe('EMP-006');
    expect(new Set(block).size).toBe(100); // all unique
  });
});

describe('allocateEmployeeCodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute the max DB-side and never full-table load', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: 41 }]);

    const block = await allocateEmployeeCodeBlock('tenant-1', 2);

    expect(block).toEqual(['EMP-042', 'EMP-043']);
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(1);
    // The whole point of the fix: we must NOT load every employee code into
    // memory to find the max.
    expect(dbMock.employee.findMany).not.toHaveBeenCalled();
  });

  it('should scope the max query to the tenant', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: 0 }]);

    await allocateEmployeeCodeBlock('tenant-xyz', 1);

    // $queryRaw is a tagged template: call args are [strings, ...values]. The
    // tenant id must be passed as an interpolated (parameterized) value.
    expect(dbMock.$queryRaw.mock.calls[0]).toContain('tenant-xyz');
  });

  it('should start at EMP-001 for an empty tenant (max is null)', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: null }]);

    const block = await allocateEmployeeCodeBlock('tenant-1', 3);

    expect(block).toEqual(['EMP-001', 'EMP-002', 'EMP-003']);
  });

  it('should keep incrementing past EMP-999 (numeric max, no lexicographic break)', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: 999 }]);

    const block = await allocateEmployeeCodeBlock('tenant-1', 2);

    expect(block).toEqual(['EMP-1000', 'EMP-1001']);
  });

  it('should treat an empty result set as a fresh tenant', async () => {
    dbMock.$queryRaw.mockResolvedValue([]);

    const block = await allocateEmployeeCodeBlock('tenant-1', 1);

    expect(block).toEqual(['EMP-001']);
  });
});

describe('generateEmployeeCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should follow the numeric maximum, not a lexicographic sort', async () => {
    // Regression: a non-numeric code (e.g. EMP-PA01) sorts lexicographically
    // ABOVE EMP-904 ('P' > '9'), so the old `findFirst({ orderBy: code desc })`
    // picked it, parseInt gave NaN, and every create regenerated a colliding
    // "EMP-NaN". The fix must derive the next code from the numeric max instead.
    dbMock.$queryRaw.mockResolvedValue([{ max: 904 }]);

    const code = await generateEmployeeCode('tenant-1');

    expect(code).toBe('EMP-905');
    // Must never produce a NaN-laced code from a non-numeric existing suffix.
    expect(code).not.toContain('NaN');
    expect(dbMock.employee.findFirst).not.toHaveBeenCalled();
  });

  it('should return EMP-001 for an empty tenant', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: null }]);

    expect(await generateEmployeeCode('tenant-1')).toBe('EMP-001');
  });

  it('should keep incrementing past EMP-999', async () => {
    dbMock.$queryRaw.mockResolvedValue([{ max: 999 }]);

    expect(await generateEmployeeCode('tenant-1')).toBe('EMP-1000');
  });
});
