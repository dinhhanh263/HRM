import { db } from '../../infrastructure/database/client.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  SendEmailInput,
} from '../../app/validators/sales-email.validator.js';

function nullable(v: string | null | undefined) {
  const t = v?.trim();
  return t ? t : null;
}

/** Substitute {{customerName}} / {{ownerName}} tokens. */
function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

export const salesEmailService = {
  // ---- Templates ----
  async listTemplates(tenantId: string) {
    return db.salesEmailTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  },

  async createTemplate(tenantId: string, input: CreateTemplateInput) {
    return db.salesEmailTemplate.create({
      data: { tenantId, name: input.name.trim(), subject: input.subject, body: input.body, isActive: input.isActive ?? true },
    });
  },

  async updateTemplate(tenantId: string, id: string, input: UpdateTemplateInput) {
    const existing = await db.salesEmailTemplate.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundError('Không tìm thấy mẫu email');
    return db.salesEmailTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  },

  // ---- Send ----
  async listForCustomer(tenantId: string, customerId: string) {
    const rows = await db.salesEmailMessage.findMany({ where: { tenantId, customerId }, orderBy: { createdAt: 'desc' } });
    return rows.map((m) => ({
      id: m.id, to: m.to, subject: m.subject, body: m.body, status: m.status,
      sentAt: m.sentAt ? m.sentAt.toISOString() : null, createdAt: m.createdAt.toISOString(),
    }));
  },

  /**
   * Queue an email to a customer. Renders subject/body (template or free-form), records
   * a QUEUED SalesEmailMessage + an EMAIL activity, then enqueues async delivery (Resend).
   */
  async send(tenantId: string, actorEmployeeId: string | null, input: SendEmailInput) {
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, tenantId },
      include: { owner: { select: { fullName: true } } },
    });
    if (!customer) throw new BadRequestError('Khách hàng không hợp lệ');
    if (!customer.email) throw new BadRequestError('Khách hàng chưa có email');

    let subject = input.subject ?? '';
    let body = input.body ?? '';
    if (input.templateId) {
      const tpl = await db.salesEmailTemplate.findFirst({ where: { id: input.templateId, tenantId } });
      if (!tpl) throw new BadRequestError('Mẫu email không hợp lệ');
      subject = subject || tpl.subject;
      body = body || tpl.body;
    }
    const vars = { customerName: customer.fullName, ownerName: customer.owner?.fullName ?? '' };
    subject = render(subject, vars);
    body = render(body, vars);
    if (!subject.trim() || !body.trim()) throw new BadRequestError('Thiếu tiêu đề hoặc nội dung email');

    const message = await db.$transaction(async (tx) => {
      const msg = await tx.salesEmailMessage.create({
        data: {
          tenantId,
          customerId: input.customerId,
          dealId: input.dealId ?? null,
          templateId: nullable(input.templateId),
          to: customer.email!,
          subject,
          body,
          status: 'QUEUED',
          sentById: actorEmployeeId,
        },
      });
      await tx.salesActivity.create({
        data: { tenantId, customerId: input.customerId, dealId: input.dealId ?? null, authorId: actorEmployeeId, type: 'EMAIL', body: subject },
      });
      return msg;
    });

    await enqueueTask('sales-email', { messageId: message.id });
    return { id: message.id, to: message.to, subject, status: message.status };
  },
};
