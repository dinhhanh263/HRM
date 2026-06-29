import { db } from '../../infrastructure/database/client.js';

const TEAM_INCLUDE = {
  department: { select: { name: true } },
  lead: { select: { fullName: true } },
  members: { select: { id: true } },
  _count: { select: { members: true } },
};

export const kpiTeamRefs = {
  departmentInTenant: (tenantId: string, id: string) =>
    db.department.findFirst({ where: { id, tenantId }, select: { id: true } }),
  employeeInTenant: (tenantId: string, id: string) =>
    db.employee.findFirst({ where: { id, tenantId }, select: { id: true } }),
};

export const kpiTeamRepository = {
  findAll(tenantId: string) {
    return db.team.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: TEAM_INCLUDE,
    });
  },

  findById(id: string, tenantId: string) {
    return db.team.findFirst({ where: { id, tenantId }, include: TEAM_INCLUDE });
  },

  findByName(name: string, tenantId: string) {
    return db.team.findFirst({ where: { tenantId, name }, select: { id: true } });
  },

  async create(
    tenantId: string,
    data: { name: string; departmentId: string | null; leadId: string | null; memberIds: string[] },
  ) {
    const team = await db.team.create({
      data: { tenantId, name: data.name, departmentId: data.departmentId, leadId: data.leadId },
    });
    if (data.memberIds.length > 0) {
      await db.employee.updateMany({
        where: { tenantId, id: { in: data.memberIds } },
        data: { teamId: team.id },
      });
    }
    return team.id;
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; departmentId?: string | null; leadId?: string | null; memberIds?: string[] },
  ) {
    await db.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: { name: data.name, departmentId: data.departmentId, leadId: data.leadId },
      });
      if (data.memberIds) {
        // Gỡ thành viên cũ không còn trong danh sách
        await tx.employee.updateMany({
          where: { tenantId, teamId: id, id: { notIn: data.memberIds } },
          data: { teamId: null },
        });
        // Gán thành viên mới (chỉ trong tenant)
        if (data.memberIds.length > 0) {
          await tx.employee.updateMany({
            where: { tenantId, id: { in: data.memberIds } },
            data: { teamId: id },
          });
        }
      }
    });
  },

  delete(id: string) {
    // Employee.teamId là SET NULL on delete → thành viên tự gỡ khỏi team.
    return db.team.delete({ where: { id } });
  },
};
