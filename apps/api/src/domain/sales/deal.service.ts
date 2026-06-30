import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { db } from '../../infrastructure/database/client.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import type { CustomerScope } from './customer.normalize.js';
import { dealRepository, type DealListFilters } from './deal.repository.js';
import { toDealDto } from './mappers.js';
import type { CreateDealInput, UpdateDealInput } from '../../app/validators/sales-deal.validator.js';

async function assertCustomer(tenantId: string, customerId: string) {
  const c = await db.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
  if (!c) throw new BadRequestError('Khách hàng không hợp lệ');
}

async function assertOwner(tenantId: string, ownerId: string) {
  const e = await employeeRepository.findById(ownerId, tenantId);
  if (!e) throw new BadRequestError('Người phụ trách không hợp lệ');
}

/** Resolve+validate the stage: belongs to the pipeline (+ tenant). Defaults to the first stage. */
async function resolveStage(tenantId: string, pipelineId: string, stageId?: string): Promise<string> {
  const pipeline = await db.salesPipeline.findFirst({ where: { id: pipelineId, tenantId }, select: { id: true } });
  if (!pipeline) throw new BadRequestError('Pipeline không hợp lệ');
  if (stageId) {
    const stage = await db.salesStage.findFirst({ where: { id: stageId, pipelineId }, select: { id: true } });
    if (!stage) throw new BadRequestError('Giai đoạn không thuộc pipeline');
    return stage.id;
  }
  const first = await db.salesStage.findFirst({ where: { pipelineId }, orderBy: { order: 'asc' }, select: { id: true } });
  if (!first) throw new BadRequestError('Pipeline chưa có giai đoạn');
  return first.id;
}

export const dealService = {
  async list(tenantId: string, scope: CustomerScope, filters: DealListFilters) {
    const rows = await dealRepository.list(tenantId, scope, filters);
    return rows.map(toDealDto);
  },

  async get(tenantId: string, id: string) {
    const row = await dealRepository.findById(tenantId, id);
    if (!row) throw new NotFoundError('Không tìm thấy cơ hội');
    return toDealDto(row);
  },

  async create(tenantId: string, actorEmployeeId: string | null, input: CreateDealInput) {
    await assertCustomer(tenantId, input.customerId);
    const ownerId = input.ownerId ?? actorEmployeeId;
    if (!ownerId) throw new BadRequestError('Cần chỉ định người phụ trách');
    await assertOwner(tenantId, ownerId);
    const currentStageId = await resolveStage(tenantId, input.pipelineId, input.currentStageId);

    const created = await dealRepository.create({
      tenantId,
      customerId: input.customerId,
      pipelineId: input.pipelineId,
      currentStageId,
      ownerId,
      title: input.title.trim(),
      currency: input.currency ?? 'VND',
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
    });
    return toDealDto(created);
  },

  async update(tenantId: string, id: string, input: UpdateDealInput) {
    if (input.ownerId !== undefined) await assertOwner(tenantId, input.ownerId);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.ownerId !== undefined) data.ownerId = input.ownerId;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.expectedCloseDate !== undefined) {
      data.expectedCloseDate = input.expectedCloseDate ? new Date(input.expectedCloseDate) : null;
    }
    const updated = await dealRepository.update(tenantId, id, data);
    if (!updated) throw new NotFoundError('Không tìm thấy cơ hội');
    return toDealDto(updated);
  },

  async move(tenantId: string, id: string, toStageId: string, actorEmployeeId: string | null, note?: string) {
    const result = await dealRepository.move(tenantId, id, toStageId, actorEmployeeId, note);
    if (result === null) throw new NotFoundError('Không tìm thấy cơ hội');
    if (result === 'BAD_STAGE') throw new BadRequestError('Giai đoạn không hợp lệ');
    return toDealDto(result);
  },

  async win(tenantId: string, id: string, actorEmployeeId: string | null) {
    const result = await dealRepository.close(tenantId, id, 'WON', null, actorEmployeeId, new Date());
    if (!result) throw new NotFoundError('Không tìm thấy cơ hội');
    return toDealDto(result);
  },

  async lose(tenantId: string, id: string, lostReason: string, actorEmployeeId: string | null) {
    const result = await dealRepository.close(tenantId, id, 'LOST', lostReason, actorEmployeeId, new Date());
    if (!result) throw new NotFoundError('Không tìm thấy cơ hội');
    return toDealDto(result);
  },
};
