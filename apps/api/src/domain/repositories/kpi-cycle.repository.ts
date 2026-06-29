import type { Prisma, ApproverType, ApprovalDecision } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

// Cho phép chạy trong transaction (tx) hoặc trực tiếp (db) — đảm bảo atomic recompute.
type DbClient = typeof db | Prisma.TransactionClient;
type ApproverTypeT = ApproverType;
type DecisionT = ApprovalDecision | null;

export const kpiCycleRepository = {
  findAll(tenantId: string) {
    return db.kpiCycle.findMany({
      where: { tenantId },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      include: { framework: { select: { name: true } }, _count: { select: { scorecards: true } } },
    });
  },

  findById(id: string, tenantId: string) {
    return db.kpiCycle.findFirst({ where: { id, tenantId } });
  },

  /** Chu kỳ đang mở (nhập liệu / tự đánh giá) mới nhất của 1 framework — cho respond survey. */
  findOpenCycleByFramework(tenantId: string, frameworkId: string) {
    return db.kpiCycle.findFirst({
      where: { tenantId, frameworkId, status: { in: ['DATA_ENTRY', 'SELF_ASSESSMENT'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  },

  create(data: Prisma.KpiCycleUncheckedCreateInput) {
    return db.kpiCycle.create({ data });
  },

  updateStatus(id: string, data: Prisma.KpiCycleUpdateInput) {
    return db.kpiCycle.update({ where: { id }, data });
  },

  /** Nhân viên trong scope: ACTIVE thuộc các phòng ban framework được gán. */
  async employeesInScope(tenantId: string, frameworkId: string) {
    const assignments = await db.kpiFrameworkAssignment.findMany({
      where: { frameworkId },
      select: { departmentId: true },
    });
    const deptIds = assignments.map((a) => a.departmentId);
    if (deptIds.length === 0) return [];
    return db.employee.findMany({
      where: { tenantId, departmentId: { in: deptIds }, status: 'ACTIVE' },
      select: { id: true, fullName: true, teamId: true },
    });
  },

  async generateScorecards(tenantId: string, cycleId: string, employeeIds: string[]) {
    if (employeeIds.length === 0) return;
    await db.kpiScorecard.createMany({
      data: employeeIds.map((employeeId) => ({ tenantId, cycleId, employeeId })),
      skipDuplicates: true,
    });
  },

  scorecardsByCycle(cycleId: string, client: DbClient = db) {
    return client.kpiScorecard.findMany({
      where: { cycleId },
      include: {
        employee: { select: { fullName: true, teamId: true } },
        pillars: true,
        approvals: { orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }] },
      },
      orderBy: { employee: { fullName: 'asc' } },
    });
  },

  findScorecard(id: string, tenantId: string) {
    return db.kpiScorecard.findFirst({ where: { id, tenantId }, select: { id: true, cycleId: true } });
  },

  /** Scorecard + cycle status + approvals — cho self-assess và duyệt review. */
  findScorecardForReview(id: string, tenantId: string) {
    return db.kpiScorecard.findFirst({
      where: { id, tenantId },
      include: {
        cycle: { select: { id: true, status: true, frameworkId: true } },
        approvals: { orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }] },
      },
    });
  },

  saveSelfAssessment(scorecardId: string, selfComment: string) {
    return db.kpiScorecard.update({
      where: { id: scorecardId },
      data: { selfComment, selfSubmittedAt: new Date(), status: 'SELF_ASSESSED' },
    });
  },

  /** Snapshot chuỗi duyệt cho 1 scorecard (round mới) + đặt trạng thái/flow/currentStep. */
  async persistScorecardSnapshot(
    scorecardId: string,
    tenantId: string,
    data: { flowId: string | null; currentStep: number; status: 'IN_REVIEW' | 'FINALIZED' },
    approvals: {
      round: number; stepOrder: number; approverType: ApproverTypeT; roleKey: string | null;
      approverId: string | null; decision: DecisionT; decidedAt: Date | null; note: string | null;
    }[],
    client: DbClient = db,
  ) {
    await client.kpiScorecard.update({
      where: { id: scorecardId },
      data: { flowId: data.flowId, currentStep: data.currentStep, status: data.status },
    });
    if (approvals.length > 0) {
      await client.kpiScorecardApproval.createMany({
        data: approvals.map((a) => ({ ...a, tenantId, scorecardId })),
      });
    }
  },

  async recordScorecardDecision(
    approvalId: string,
    decision: { decision: DecisionT; decidedById: string | null; decidedAt: Date; note: string | null },
    scorecardId: string,
    scorecardUpdate: Prisma.KpiScorecardUpdateInput,
  ) {
    await db.$transaction(async (tx) => {
      await tx.kpiScorecardApproval.update({ where: { id: approvalId }, data: decision });
      await tx.kpiScorecard.update({ where: { id: scorecardId }, data: scorecardUpdate });
    });
  },

  updateScorecardReviewNotes(scorecardId: string, data: Prisma.KpiScorecardUpdateInput) {
    return db.kpiScorecard.update({ where: { id: scorecardId }, data });
  },

  /** Lịch sử scorecard của 1 nhân viên qua các chu kỳ (cho biểu đồ xu hướng). */
  scorecardHistory(tenantId: string, employeeId: string) {
    return db.kpiScorecard.findMany({
      where: { tenantId, employeeId },
      include: {
        employee: { select: { fullName: true } },
        cycle: { select: { period: true, periodType: true, status: true, framework: { select: { name: true } } } },
        pillars: { include: { pillar: { select: { name: true, order: true } } } },
      },
      // Sắp theo thời điểm tạo cycle (chronological thật) — tránh sort chuỗi period
      // làm lệch khi trộn kỳ tháng "YYYY-MM" và quý "YYYY-Qn".
      orderBy: { cycle: { createdAt: 'asc' } },
    });
  },

  entriesByCycle(cycleId: string, client: DbClient = db) {
    return client.kpiEntry.findMany({ where: { cycleId } });
  },

  /** Upsert 1 entry cá nhân (scorecardId) — unique [scorecardId, kpiDefinitionId]. */
  upsertIndividualEntry(
    data: {
      tenantId: string; cycleId: string; scorecardId: string; kpiDefinitionId: string;
      actualValue: number | null; computedScore: number | null; note: string | null; enteredById: string | null;
    },
    client: DbClient = db,
  ) {
    const { tenantId, cycleId, scorecardId, kpiDefinitionId, ...rest } = data;
    return client.kpiEntry.upsert({
      where: { scorecardId_kpiDefinitionId: { scorecardId, kpiDefinitionId } },
      create: { tenantId, cycleId, scorecardId, kpiDefinitionId, source: 'manual', enteredAt: new Date(), ...rest },
      update: { ...rest, source: 'manual', enteredAt: new Date() },
    });
  },

  /** Upsert 1 entry team (teamId) — unique [cycleId, teamId, kpiDefinitionId]. */
  upsertTeamEntry(
    data: {
      tenantId: string; cycleId: string; teamId: string; kpiDefinitionId: string;
      actualValue: number | null; computedScore: number | null; note: string | null; enteredById: string | null;
    },
    client: DbClient = db,
  ) {
    const { tenantId, cycleId, teamId, kpiDefinitionId, ...rest } = data;
    return client.kpiEntry.upsert({
      where: { cycleId_teamId_kpiDefinitionId: { cycleId, teamId, kpiDefinitionId } },
      create: { tenantId, cycleId, teamId, kpiDefinitionId, source: 'manual', enteredAt: new Date(), ...rest },
      update: { ...rest, source: 'manual', enteredAt: new Date() },
    });
  },

  /** Lưu kết quả tính 1 scorecard. Dùng client truyền vào (đã ở trong transaction). */
  async saveScorecardComputation(
    scorecardId: string,
    weightedTotal: number | null,
    ratingLabel: string | null,
    pillars: { pillarId: string; score: number | null; weight: number }[],
    client: DbClient = db,
  ) {
    await client.kpiScorecard.update({ where: { id: scorecardId }, data: { weightedTotal, ratingLabel } });
    await client.kpiScorecardPillar.deleteMany({ where: { scorecardId } });
    await client.kpiScorecardPillar.createMany({
      data: pillars.map((p) => ({ scorecardId, pillarId: p.pillarId, score: p.score, weight: p.weight })),
    });
  },

  setScorecardProfile(scorecardId: string, weightProfileId: string | null, weightProfileName: string | null, client: DbClient = db) {
    return client.kpiScorecard.update({ where: { id: scorecardId }, data: { weightProfileId, weightProfileName } });
  },
};
