import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  countRequests: vi.fn(),
};

vi.mock('../../src/domain/repositories/leave-type.repository.js', () => ({
  leaveTypeRepository: repoMock,
}));

const { leaveTypeService } = await import('../../src/domain/services/leave-type.service.js');

function makeLeaveType(overrides = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'lt-1',
    tenantId: 'tenant-1',
    name: 'Nghỉ phép năm',
    code: 'ANNUAL',
    colorHex: '#3B82F6',
    defaultDays: 12,
    paid: true,
    requiresAttachment: false,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('leaveTypeService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should uppercase the code and create when code is unique', async () => {
    repoMock.findByCode.mockResolvedValue(null);
    repoMock.create.mockResolvedValue(makeLeaveType({ code: 'REMOTE' }));

    const result = await leaveTypeService.create('tenant-1', {
      name: 'Làm từ xa',
      code: 'remote',
    });

    expect(repoMock.findByCode).toHaveBeenCalledWith('REMOTE', 'tenant-1');
    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'REMOTE', name: 'Làm từ xa' }),
    );
    expect(result.code).toBe('REMOTE');
    expect(typeof result.createdAt).toBe('string');
  });

  it('should throw ConflictError when the code already exists', async () => {
    repoMock.findByCode.mockResolvedValue(makeLeaveType());

    await expect(
      leaveTypeService.create('tenant-1', { name: 'Dup', code: 'ANNUAL' }),
    ).rejects.toThrow('A leave type with this code already exists');
    expect(repoMock.create).not.toHaveBeenCalled();
  });
});

describe('leaveTypeService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should throw NotFoundError when the leave type does not exist', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(
      leaveTypeService.update('missing', 'tenant-1', { name: 'X' }),
    ).rejects.toThrow('Leave type not found');
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should update an existing leave type', async () => {
    repoMock.findById.mockResolvedValue(makeLeaveType());
    repoMock.update.mockResolvedValue(makeLeaveType({ name: 'Updated' }));

    const result = await leaveTypeService.update('lt-1', 'tenant-1', { name: 'Updated' });

    expect(result.name).toBe('Updated');
  });
});

describe('leaveTypeService.remove', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should throw NotFoundError when the leave type does not exist', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(leaveTypeService.remove('missing', 'tenant-1')).rejects.toThrow(
      'Leave type not found',
    );
  });

  it('should block deletion when requests reference the type', async () => {
    repoMock.findById.mockResolvedValue(makeLeaveType());
    repoMock.countRequests.mockResolvedValue(3);

    await expect(leaveTypeService.remove('lt-1', 'tenant-1')).rejects.toThrow(
      'Cannot delete a leave type that has requests. Deactivate it instead.',
    );
    expect(repoMock.delete).not.toHaveBeenCalled();
  });

  it('should delete when no requests reference the type', async () => {
    repoMock.findById.mockResolvedValue(makeLeaveType());
    repoMock.countRequests.mockResolvedValue(0);
    repoMock.delete.mockResolvedValue(makeLeaveType());

    await leaveTypeService.remove('lt-1', 'tenant-1');

    expect(repoMock.delete).toHaveBeenCalledWith('lt-1', 'tenant-1');
  });
});
