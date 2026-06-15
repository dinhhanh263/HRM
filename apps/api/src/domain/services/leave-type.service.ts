import { leaveTypeRepository, type LeaveTypeFilters } from '../repositories/leave-type.repository.js';
import { toLeaveTypeDto } from '../leave/mappers.js';
import { NotFoundError, ConflictError } from '../../shared/errors/index.js';
import type { LeaveTypeDto } from '@hrm/shared';

export interface CreateLeaveTypeInput {
  name: string;
  code: string;
  colorHex?: string | null;
  defaultDays?: number;
  paid?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
}

export interface UpdateLeaveTypeInput {
  name?: string;
  colorHex?: string | null;
  defaultDays?: number;
  paid?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
}

export const leaveTypeService = {
  async getAll(tenantId: string, filters: LeaveTypeFilters = {}): Promise<LeaveTypeDto[]> {
    const types = await leaveTypeRepository.findAll(tenantId, filters);
    return types.map(toLeaveTypeDto);
  },

  async create(tenantId: string, input: CreateLeaveTypeInput): Promise<LeaveTypeDto> {
    const code = input.code.trim().toUpperCase();

    const existing = await leaveTypeRepository.findByCode(code, tenantId);
    if (existing) {
      throw new ConflictError('A leave type with this code already exists');
    }

    const created = await leaveTypeRepository.create({
      tenant: { connect: { id: tenantId } },
      name: input.name,
      code,
      colorHex: input.colorHex ?? null,
      defaultDays: input.defaultDays ?? 0,
      paid: input.paid ?? true,
      requiresAttachment: input.requiresAttachment ?? false,
      active: input.active ?? true,
    });

    return toLeaveTypeDto(created);
  },

  async update(id: string, tenantId: string, input: UpdateLeaveTypeInput): Promise<LeaveTypeDto> {
    const existing = await leaveTypeRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Leave type not found');
    }

    const updated = await leaveTypeRepository.update(id, tenantId, {
      name: input.name,
      colorHex: input.colorHex,
      defaultDays: input.defaultDays,
      paid: input.paid,
      requiresAttachment: input.requiresAttachment,
      active: input.active,
    });

    return toLeaveTypeDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await leaveTypeRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Leave type not found');
    }

    const requestCount = await leaveTypeRepository.countRequests(id);
    if (requestCount > 0) {
      throw new ConflictError(
        'Cannot delete a leave type that has requests. Deactivate it instead.',
      );
    }

    await leaveTypeRepository.delete(id, tenantId);
  },
};
