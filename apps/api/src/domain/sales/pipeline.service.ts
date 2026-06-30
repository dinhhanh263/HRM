import type { SalesStageType } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/index.js';

// SPEC-045: pipeline + stage read/config. Task 2.1.
export const salesPipelineService = {
  async list(tenantId: string) {
    return db.salesPipeline.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  },

  async getStages(tenantId: string, pipelineId: string) {
    const pipeline = await db.salesPipeline.findFirst({ where: { id: pipelineId, tenantId } });
    if (!pipeline) throw new NotFoundError('Không tìm thấy pipeline');
    return db.salesStage.findMany({ where: { pipelineId }, orderBy: { order: 'asc' } });
  },

  async createStage(
    tenantId: string,
    pipelineId: string,
    input: { name: string; type: SalesStageType; probability: number },
  ) {
    const pipeline = await db.salesPipeline.findFirst({ where: { id: pipelineId, tenantId } });
    if (!pipeline) throw new NotFoundError('Không tìm thấy pipeline');
    const max = await db.salesStage.aggregate({ where: { pipelineId }, _max: { order: true } });
    return db.salesStage.create({
      data: {
        pipelineId,
        name: input.name.trim(),
        type: input.type,
        probability: input.probability,
        order: (max._max.order ?? -1) + 1,
      },
    });
  },

  async updateStage(
    tenantId: string,
    stageId: string,
    input: { name?: string; type?: SalesStageType; probability?: number },
  ) {
    const stage = await db.salesStage.findFirst({ where: { id: stageId, pipeline: { tenantId } } });
    if (!stage) throw new NotFoundError('Không tìm thấy giai đoạn');
    return db.salesStage.update({
      where: { id: stageId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.probability !== undefined ? { probability: input.probability } : {}),
      },
    });
  },

  /**
   * Delete a stage — only if it was NEVER used. review#1: `deal_stage_history.to_stage_id`
   * is FK RESTRICT, so a stage referenced by any deal OR any history row cannot be removed.
   * We pre-check for a friendly 409 instead of surfacing a raw FK violation.
   */
  async deleteStage(tenantId: string, stageId: string) {
    const stage = await db.salesStage.findFirst({ where: { id: stageId, pipeline: { tenantId } } });
    if (!stage) throw new NotFoundError('Không tìm thấy giai đoạn');
    const [deals, historyTo, historyFrom] = await Promise.all([
      db.deal.count({ where: { currentStageId: stageId } }),
      db.dealStageHistory.count({ where: { toStageId: stageId } }),
      db.dealStageHistory.count({ where: { fromStageId: stageId } }),
    ]);
    if (deals + historyTo + historyFrom > 0) {
      throw new ConflictError('Giai đoạn đã được sử dụng, không thể xóa', 'STAGE_IN_USE');
    }
    await db.salesStage.delete({ where: { id: stageId } });
  },

  /** Reorder all stages of a pipeline. Two-pass within a tx to dodge the (pipeline,order) unique. */
  async reorderStages(tenantId: string, pipelineId: string, orderedIds: string[]) {
    const stages = await db.salesStage.findMany({ where: { pipelineId, pipeline: { tenantId } }, select: { id: true } });
    const existing = new Set(stages.map((s) => s.id));
    if (stages.length !== orderedIds.length || !orderedIds.every((id) => existing.has(id))) {
      throw new BadRequestError('Danh sách giai đoạn không khớp');
    }
    await db.$transaction(async (tx) => {
      // Pass 1: park at high temporary orders to avoid unique collisions.
      await Promise.all(orderedIds.map((id, i) => tx.salesStage.update({ where: { id }, data: { order: 1000 + i } })));
      // Pass 2: final 0-based order.
      await Promise.all(orderedIds.map((id, i) => tx.salesStage.update({ where: { id }, data: { order: i } })));
    });
    return this.getStages(tenantId, pipelineId);
  },
};
