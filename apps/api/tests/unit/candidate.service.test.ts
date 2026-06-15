import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByPhone: vi.fn(),
  findNameCandidates: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
vi.mock('../../src/domain/repositories/candidate.repository.js', () => ({
  candidateRepository: repoMock,
}));

const { candidateService } = await import('../../src/domain/services/candidate.service.js');
const { ConflictError } = await import('../../src/shared/errors/AppError.js');

const TENANT = 'tenant-1';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    tenantId: TENANT,
    fullName: 'Nguyễn Văn A',
    email: 'a@example.com',
    phone: '+84901234567',
    location: null,
    currentTitle: null,
    totalYearsExp: null,
    source: 'DIRECT',
    links: null,
    avatar: null,
    dateOfBirth: null,
    gender: null,
    skills: [],
    consentGivenAt: null,
    consentSource: null,
    retentionUntil: null,
    createdAt: new Date('2026-06-06T00:00:00Z'),
    updatedAt: new Date('2026-06-06T00:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findByEmail.mockResolvedValue(null);
  repoMock.findByPhone.mockResolvedValue(null);
  repoMock.findNameCandidates.mockResolvedValue([]);
  repoMock.create.mockImplementation(async (data: Record<string, unknown>) =>
    row({ id: 'new', ...data })
  );
});

describe('candidateService.create — dedupe', () => {
  it('should normalize phone to E.164 before persisting', async () => {
    await candidateService.create(TENANT, { fullName: 'Lê Văn B', phone: '0901234567' });
    expect(repoMock.create).toHaveBeenCalledTimes(1);
    expect(repoMock.create.mock.calls[0][0].phone).toBe('+84901234567');
  });

  it('should block an exact email duplicate with a 409 and a stable code', async () => {
    repoMock.findByEmail.mockResolvedValue(row());
    await expect(
      candidateService.create(TENANT, { fullName: 'Nguyễn Văn A', email: 'A@example.com' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANDIDATE_DUPLICATE_EMAIL' });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should block a duplicate phone after normalization', async () => {
    repoMock.findByPhone.mockResolvedValue(row());
    await expect(
      candidateService.create(TENANT, { fullName: 'Khác Tên', phone: '090 123 4567' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANDIDATE_DUPLICATE_PHONE' });
    // Phone lookup must use the normalized value, not the raw input.
    expect(repoMock.findByPhone).toHaveBeenCalledWith(TENANT, '+84901234567');
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should warn (409) on a diacritic-insensitive name match without force', async () => {
    repoMock.findNameCandidates.mockResolvedValue([
      { id: 'c1', fullName: 'Nguyễn Văn A', email: null, phone: null, currentTitle: 'Dev' },
    ]);
    await expect(
      candidateService.create(TENANT, { fullName: 'nguyen van a' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANDIDATE_POSSIBLE_DUPLICATE' });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should include the matched candidates in the possible-duplicate error details', async () => {
    repoMock.findNameCandidates.mockResolvedValue([
      { id: 'c1', fullName: 'Nguyễn Văn A', email: null, phone: null, currentTitle: 'Dev' },
    ]);
    try {
      await candidateService.create(TENANT, { fullName: 'Nguyen Van A' });
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as InstanceType<typeof ConflictError>).details).toMatchObject({
        matches: [{ id: 'c1', fullName: 'Nguyễn Văn A' }],
      });
    }
  });

  it('should create despite a name match when force is true', async () => {
    repoMock.findNameCandidates.mockResolvedValue([
      { id: 'c1', fullName: 'Nguyễn Văn A', email: null, phone: null, currentTitle: 'Dev' },
    ]);
    const result = await candidateService.create(TENANT, {
      fullName: 'Nguyễn Văn A',
      force: true,
    });
    expect(repoMock.create).toHaveBeenCalledTimes(1);
    expect(result.fullName).toBe('Nguyễn Văn A');
  });

  it('should default source to DIRECT', async () => {
    await candidateService.create(TENANT, { fullName: 'Trần C' });
    expect(repoMock.create.mock.calls[0][0].source).toBe('DIRECT');
  });

  it('should not treat a different name as a duplicate', async () => {
    repoMock.findNameCandidates.mockResolvedValue([
      { id: 'c1', fullName: 'Nguyễn Văn A', email: null, phone: null, currentTitle: null },
    ]);
    await candidateService.create(TENANT, { fullName: 'Phạm Quốc Việt' });
    expect(repoMock.create).toHaveBeenCalledTimes(1);
  });
});

describe('candidateService.update — dedupe', () => {
  it('should reject changing email to one used by another candidate', async () => {
    repoMock.findById.mockResolvedValue(row({ id: 'c1' }));
    repoMock.findByEmail.mockResolvedValue(row({ id: 'c2', email: 'taken@example.com' }));
    await expect(
      candidateService.update('c1', TENANT, { email: 'taken@example.com' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANDIDATE_DUPLICATE_EMAIL' });
  });

  it('should allow keeping the same email (self match is not a conflict)', async () => {
    repoMock.findById.mockResolvedValue(row({ id: 'c1', email: 'a@example.com' }));
    repoMock.findByEmail.mockResolvedValue(row({ id: 'c1', email: 'a@example.com' }));
    repoMock.update.mockResolvedValue(row({ id: 'c1' }));
    await expect(
      candidateService.update('c1', TENANT, { email: 'a@example.com' })
    ).resolves.toBeTruthy();
  });
});
