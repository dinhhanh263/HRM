import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { registerAllHandlers } from '../../src/infrastructure/tasks/register-handlers.js';

// SPEC-045 Phase 4 — Activity feed + Tasks (+ reminder) + Email (template + send via queue).
const SLUG = 'sales-engage-tenant';
const ADMIN = { email: 'admin@salesengage.com', password: 'Admin@123' };
const tick = () => new Promise((r) => setTimeout(r, 80));

async function cleanup(tenantId: string) {
  await db.salesEmailMessage.deleteMany({ where: { tenantId } });
  await db.salesEmailTemplate.deleteMany({ where: { tenantId } });
  await db.salesTask.deleteMany({ where: { tenantId } });
  await db.salesActivity.deleteMany({ where: { tenantId } });
  await db.notification.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}
async function login(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: ADMIN.password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Sales engagement (activity + tasks + email)', () => {
  let tenantId: string;
  let token: string;
  let employeeId: string;
  let userId: string;
  let customerId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    registerAllHandlers();
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Engage', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    const user = await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    userId = user.id;
    const emp = await db.employee.create({ data: { tenantId, userId: user.id, employeeCode: 'ADM', fullName: 'Admin', joinDate: new Date(), contractType: 'FULL_TIME' } });
    employeeId = emp.id;
    token = await login();
    const cust = await db.customer.create({ data: { tenantId, type: 'B2C', fullName: 'Khách A', email: 'khacha@buyer.com', ownerId: employeeId } });
    customerId = cust.id;
  });

  it('records a manual NOTE and returns it in the activity feed', async () => {
    const add = await request(app).post(`/api/v1/sales/customers/${customerId}/activities`).set(auth()).send({ body: 'Đã gọi điện, KH quan tâm' });
    expect(add.status).toBe(201);
    expect(add.body.data.type).toBe('NOTE');
    const feed = await request(app).get(`/api/v1/sales/customers/${customerId}/activities`).set(auth());
    expect(feed.body.data.some((a: { type: string; body: string }) => a.type === 'NOTE' && a.body.includes('quan tâm'))).toBe(true);
  });

  it('creates a follow-up task; a due reminder notification is delivered to the assignee', async () => {
    const res = await request(app).post('/api/v1/sales/tasks').set(auth()).send({
      title: 'Gọi lại khách A', type: 'CALL', customerId, dueAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(res.status).toBe(201);
    const taskId = res.body.data.id;
    await tick(); // inline driver runs the reminder handler

    const notif = await db.notification.findFirst({ where: { tenantId, userId, kind: 'sales_task_due', entityId: taskId } });
    expect(notif).not.toBeNull();

    const mine = await request(app).get('/api/v1/sales/tasks/mine?status=OPEN').set(auth());
    expect(mine.body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);
  });

  it('completes a task', async () => {
    const created = await request(app).post('/api/v1/sales/tasks').set(auth()).send({ title: 'Xong việc', customerId, dueAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app).post(`/api/v1/sales/tasks/${created.body.data.id}/complete`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DONE');
    expect(res.body.data.completedAt).toBeTruthy();
  });

  it('sends an email from a template → QUEUED→SENT + EMAIL activity + history', async () => {
    const tpl = await request(app).post('/api/v1/sales/email-templates').set(auth()).send({
      name: 'Chào hàng', subject: 'Xin chào {{customerName}}', body: 'Cảm ơn {{customerName}}, tôi là {{ownerName}}.',
    });
    const send = await request(app).post('/api/v1/sales/emails').set(auth()).send({ customerId, templateId: tpl.body.data.id });
    expect(send.status).toBe(201);
    expect(send.body.data.subject).toBe('Xin chào Khách A'); // var rendered
    await tick(); // worker delivers

    const msg = await db.salesEmailMessage.findFirst({ where: { tenantId, customerId } });
    expect(msg?.status).toBe('SENT'); // RESEND_API_KEY absent → sendRaw skips cleanly → SENT
    const act = await db.salesActivity.findMany({ where: { tenantId, customerId, type: 'EMAIL' } });
    expect(act.length).toBeGreaterThanOrEqual(1);
    const history = await request(app).get(`/api/v1/sales/customers/${customerId}/emails`).set(auth());
    expect(history.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects sending to a customer with no email (400)', async () => {
    const noEmail = await db.customer.create({ data: { tenantId, type: 'B2C', fullName: 'No Email', ownerId: employeeId } });
    const res = await request(app).post('/api/v1/sales/emails').set(auth()).send({ customerId: noEmail.id, subject: 'Hi', body: 'Test' });
    expect(res.status).toBe(400);
  });
});
