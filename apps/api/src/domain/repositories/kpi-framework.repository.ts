import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const FRAMEWORK_FULL_INCLUDE = {
  pillars: { include: { definitions: true } },
  weightProfiles: { include: { pillarWeights: true } },
  ratingBands: true,
  assignments: true,
} satisfies Prisma.KpiFrameworkInclude;

export const kpiFrameworkRepository = {
  async findAll(tenantId: string) {
    const rows = await db.kpiFramework.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { pillars: true, assignments: true } },
        pillars: { select: { _count: { select: { definitions: true } } } },
      },
    });
    return rows.map((r) => ({
      ...r,
      kpiCount: r.pillars.reduce((s, p) => s + p._count.definitions, 0),
    }));
  },

  findById(id: string, tenantId: string) {
    return db.kpiFramework.findFirst({
      where: { id, tenantId },
      include: FRAMEWORK_FULL_INCLUDE,
    });
  },

  findByName(name: string, tenantId: string) {
    return db.kpiFramework.findFirst({ where: { tenantId, name }, select: { id: true } });
  },

  create(data: Prisma.KpiFrameworkUncheckedCreateInput) {
    return db.kpiFramework.create({ data, select: { id: true } });
  },

  update(id: string, data: Prisma.KpiFrameworkUpdateInput) {
    return db.kpiFramework.update({ where: { id }, data });
  },

  delete(id: string) {
    return db.kpiFramework.delete({ where: { id } });
  },

  countCycles(frameworkId: string) {
    return db.kpiCycle.count({ where: { frameworkId } });
  },

  // ── Pillars ────────────────────────────────────────────────────────────
  findPillarInTenant(pillarId: string, tenantId: string) {
    return db.kpiPillar.findFirst({
      where: { id: pillarId, framework: { tenantId } },
      select: { id: true, frameworkId: true },
    });
  },
  createPillar(frameworkId: string, data: Omit<Prisma.KpiPillarUncheckedCreateInput, 'frameworkId'>) {
    return db.kpiPillar.create({ data: { ...data, frameworkId } });
  },
  updatePillar(id: string, data: Prisma.KpiPillarUpdateInput) {
    return db.kpiPillar.update({ where: { id }, data });
  },
  deletePillar(id: string) {
    return db.kpiPillar.delete({ where: { id } });
  },

  // ── Definitions ──────────────────────────────────────────────────────────
  findDefinitionInTenant(defId: string, tenantId: string) {
    return db.kpiDefinition.findFirst({
      where: { id: defId, pillar: { framework: { tenantId } } },
      select: { id: true, pillarId: true },
    });
  },
  createDefinition(pillarId: string, data: Omit<Prisma.KpiDefinitionUncheckedCreateInput, 'pillarId'>) {
    return db.kpiDefinition.create({ data: { ...data, pillarId } });
  },
  updateDefinition(id: string, data: Prisma.KpiDefinitionUpdateInput) {
    return db.kpiDefinition.update({ where: { id }, data });
  },
  deleteDefinition(id: string) {
    return db.kpiDefinition.delete({ where: { id } });
  },

  // ── Weight profiles ──────────────────────────────────────────────────────
  findProfileInTenant(profileId: string, tenantId: string) {
    return db.kpiWeightProfile.findFirst({
      where: { id: profileId, framework: { tenantId } },
      select: { id: true },
    });
  },
  async createProfile(
    frameworkId: string,
    data: { name: string; description: string | null; pillarWeights: { pillarId: string; weight: number }[] },
  ) {
    return db.kpiWeightProfile.create({
      data: {
        frameworkId,
        name: data.name,
        description: data.description,
        pillarWeights: { create: data.pillarWeights },
      },
    });
  },
  async updateProfile(
    id: string,
    data: { name?: string; description?: string | null; pillarWeights?: { pillarId: string; weight: number }[] },
  ) {
    return db.$transaction(async (tx) => {
      await tx.kpiWeightProfile.update({
        where: { id },
        data: { name: data.name, description: data.description },
      });
      if (data.pillarWeights) {
        await tx.kpiProfilePillarWeight.deleteMany({ where: { profileId: id } });
        await tx.kpiProfilePillarWeight.createMany({
          data: data.pillarWeights.map((w) => ({ profileId: id, pillarId: w.pillarId, weight: w.weight })),
        });
      }
    });
  },
  deleteProfile(id: string) {
    return db.kpiWeightProfile.delete({ where: { id } });
  },

  // ── Rating bands ─────────────────────────────────────────────────────────
  findBandInTenant(bandId: string, tenantId: string) {
    return db.kpiRatingBand.findFirst({
      where: { id: bandId, framework: { tenantId } },
      select: { id: true },
    });
  },
  createBand(frameworkId: string, data: Omit<Prisma.KpiRatingBandUncheckedCreateInput, 'frameworkId'>) {
    return db.kpiRatingBand.create({ data: { ...data, frameworkId } });
  },
  updateBand(id: string, data: Prisma.KpiRatingBandUpdateInput) {
    return db.kpiRatingBand.update({ where: { id }, data });
  },
  deleteBand(id: string) {
    return db.kpiRatingBand.delete({ where: { id } });
  },

  // ── Department assignment ──────────────────────────────────────────────────
  async setDepartments(frameworkId: string, tenantId: string, departmentIds: string[]) {
    // Chỉ nhận department thuộc tenant (chống gán chéo tenant).
    const valid = await db.department.findMany({
      where: { tenantId, id: { in: departmentIds } },
      select: { id: true },
    });
    const validIds = valid.map((d) => d.id);
    return db.$transaction(async (tx) => {
      await tx.kpiFrameworkAssignment.deleteMany({ where: { frameworkId } });
      if (validIds.length > 0) {
        await tx.kpiFrameworkAssignment.createMany({
          data: validIds.map((departmentId) => ({ frameworkId, departmentId })),
        });
      }
    });
  },
};
