import type { TeamDto, UpsertTeamInput } from '@hrm/shared';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { kpiTeamRepository, kpiTeamRefs } from '../repositories/kpi-team.repository.js';
import { toTeamDto } from '../kpi/mappers.js';

/** Chặn gán chéo tenant: department/lead phải thuộc tenant của người gọi. */
async function assertRefsInTenant(tenantId: string, input: UpsertTeamInput): Promise<void> {
  if (input.departmentId && !(await kpiTeamRefs.departmentInTenant(tenantId, input.departmentId))) {
    throw new NotFoundError('Department not found');
  }
  if (input.leadId && !(await kpiTeamRefs.employeeInTenant(tenantId, input.leadId))) {
    throw new NotFoundError('Lead employee not found');
  }
}

export const kpiTeamService = {
  async getAll(tenantId: string): Promise<TeamDto[]> {
    const teams = await kpiTeamRepository.findAll(tenantId);
    return teams.map(toTeamDto);
  },

  async create(tenantId: string, input: UpsertTeamInput): Promise<TeamDto> {
    const name = input.name.trim();
    if (await kpiTeamRepository.findByName(name, tenantId)) {
      throw new ConflictError('Tên team đã tồn tại');
    }
    await assertRefsInTenant(tenantId, input);
    const id = await kpiTeamRepository.create(tenantId, {
      name,
      departmentId: input.departmentId ?? null,
      leadId: input.leadId ?? null,
      memberIds: input.memberIds ?? [],
    });
    const team = await kpiTeamRepository.findById(id, tenantId);
    return toTeamDto(team!);
  },

  async update(id: string, tenantId: string, input: UpsertTeamInput): Promise<TeamDto> {
    const existing = await kpiTeamRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Team not found');
    if (input.name && input.name.trim() !== existing.name) {
      if (await kpiTeamRepository.findByName(input.name.trim(), tenantId)) {
        throw new ConflictError('Tên team đã tồn tại');
      }
    }
    await assertRefsInTenant(tenantId, input);
    await kpiTeamRepository.update(id, tenantId, {
      name: input.name?.trim(),
      departmentId: input.departmentId ?? null,
      leadId: input.leadId ?? null,
      memberIds: input.memberIds,
    });
    const team = await kpiTeamRepository.findById(id, tenantId);
    return toTeamDto(team!);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await kpiTeamRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Team not found');
    await kpiTeamRepository.delete(id);
  },
};
