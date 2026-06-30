import type { SalesTaskStatus } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import type { CreateTaskInput, UpdateTaskInput } from '../../app/validators/sales-task.validator.js';

const taskInclude = {
  customer: { select: { id: true, fullName: true } },
  deal: { select: { id: true, title: true } },
};

interface TaskRow {
  id: string;
  type: string;
  title: string;
  dueAt: Date;
  status: SalesTaskStatus;
  completedAt: Date | null;
  customer: { id: string; fullName: string } | null;
  deal: { id: string; title: string } | null;
}

function toDto(t: TaskRow) {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    dueAt: t.dueAt.toISOString(),
    status: t.status,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    customer: t.customer,
    deal: t.deal,
  };
}

/** Schedule the due reminder (delayed BullMQ job). Past-due → fire ~immediately. */
async function scheduleReminder(taskId: string, dueAt: Date): Promise<void> {
  const delaySeconds = Math.max(0, Math.floor((dueAt.getTime() - Date.now()) / 1000));
  await enqueueTask('sales-task-reminder', { taskId }, { delaySeconds });
}

export const salesTaskService = {
  /** Tasks assigned to an employee, optionally filtered by status. Newest-due first. */
  async listMine(tenantId: string, assigneeId: string | null, status?: SalesTaskStatus) {
    if (!assigneeId) return [];
    const rows = await db.salesTask.findMany({
      where: { tenantId, assigneeId, ...(status ? { status } : {}) },
      include: taskInclude,
      orderBy: { dueAt: 'asc' },
    });
    return rows.map((r) => toDto(r as TaskRow));
  },

  async listForCustomer(tenantId: string, customerId: string) {
    const rows = await db.salesTask.findMany({ where: { tenantId, customerId }, include: taskInclude, orderBy: { dueAt: 'asc' } });
    return rows.map((r) => toDto(r as TaskRow));
  },

  async create(tenantId: string, actorEmployeeId: string | null, input: CreateTaskInput) {
    const customer = await db.customer.findFirst({ where: { id: input.customerId, tenantId }, select: { id: true } });
    if (!customer) throw new BadRequestError('Khách hàng không hợp lệ');
    const assigneeId = input.assigneeId ?? actorEmployeeId;
    if (!assigneeId) throw new BadRequestError('Cần chỉ định người thực hiện');
    const emp = await db.employee.findFirst({ where: { id: assigneeId, tenantId }, select: { id: true } });
    if (!emp) throw new BadRequestError('Người thực hiện không hợp lệ');
    const dueAt = new Date(input.dueAt);

    const created = await db.salesTask.create({
      data: {
        tenantId,
        customerId: input.customerId,
        dealId: input.dealId ?? null,
        assigneeId,
        type: input.type ?? 'TODO',
        title: input.title.trim(),
        dueAt,
      },
      include: taskInclude,
    });
    await scheduleReminder(created.id, dueAt);
    return toDto(created as TaskRow);
  },

  async update(tenantId: string, id: string, input: UpdateTaskInput) {
    const existing = await db.salesTask.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundError('Không tìm thấy việc cần làm');
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.type !== undefined) data.type = input.type;
    let newDue: Date | undefined;
    if (input.dueAt !== undefined) { newDue = new Date(input.dueAt); data.dueAt = newDue; }
    if (input.status !== undefined) {
      data.status = input.status;
      data.completedAt = input.status === 'DONE' ? new Date() : null;
    }
    await db.salesTask.update({ where: { id }, data });
    if (newDue) await scheduleReminder(id, newDue); // re-arm reminder for the new due date
    const row = await db.salesTask.findFirst({ where: { id, tenantId }, include: taskInclude });
    return toDto(row as TaskRow);
  },

  async complete(tenantId: string, id: string) {
    return this.update(tenantId, id, { status: 'DONE' });
  },
};
