import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultPaymentFlowForTenant } from '../../src/domain/payment-request/defaults.js';

// Payment Request lifecycle + RBAC (SPEC-041):
//   create → manager approve → founder approve → APPROVED → mark-paid → PAID
//   return → resubmit (round 2);  reject → terminal (resubmit blocked)
//   scope mine/review/all; attachments upload/download; cross-tenant isolation.
const SLUG = 'pay-it-tenant';
const OTHER_SLUG = 'pay-it-other';
const FOUNDER = { email: 'founder@pay.com', password: 'Founder@123' };
const MGR = { email: 'mgr@pay.com', password: 'Manager@123' };
const EMP = { email: 'emp@pay.com', password: 'Employee@123' };
const OTHER_EMP = { email: 'other@pay.com', password: 'Other@123' };

async function cleanup(tenantId: string) {
  await db.paymentRequestApproval.deleteMany({ where: { tenantId } });
  await db.paymentRequestAttachment.deleteMany({ where: { request: { tenantId } } });
  await db.paymentRequest.deleteMany({ where: { tenantId } });
  await db.approvalStep.deleteMany({ where: { flow: { tenantId } } });
  await db.approvalFlow.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug = SLUG): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: slug });
  if (!res.body?.data?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

const REIMB = {
  type: 'REIMBURSEMENT',
  title: 'Taxi đi gặp khách',
  amount: 250000,
  expenseDate: '2026-06-20T00:00:00.000Z',
};

async function createReq(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/payment-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...REIMB, ...overrides });
}

describe('Payment Request routes (RBAC + lifecycle)', () => {
  let tenantId: string;
  let founderToken: string;
  let mgrToken: string;
  let empToken: string;
  let otherToken: string;
  let foreignRequestId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Pay IT', slug: SLUG } });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({ where: { slug: OTHER_SLUG }, update: {}, create: { name: 'Pay Other', slug: OTHER_SLUG } });
    await cleanup(tenantId);
    await cleanup(other.id);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIds = await syncSystemRolesForTenant(db, other.id);
    await seedDefaultPaymentFlowForTenant(db, tenantId);
    await seedDefaultPaymentFlowForTenant(db, other.id);

    async function makeUserEmployee(
      tid: string,
      creds: { email: string; password: string },
      role: 'SUPER_ADMIN' | 'MANAGER' | 'EMPLOYEE',
      roleId: string,
      code: string,
      managerId?: string,
    ) {
      const user = await db.user.create({
        data: {
          tenantId: tid,
          email: creds.email,
          passwordHash: await hashPassword(creds.password),
          fullName: creds.email,
          role,
          roleId,
          status: 'ACTIVE',
        },
      });
      const emp = await db.employee.create({
        data: {
          tenantId: tid,
          userId: user.id,
          employeeCode: code,
          fullName: creds.email,
          joinDate: new Date('2025-01-01'),
          contractType: 'FULL_TIME',
          ...(managerId && { managerId }),
        },
      });
      return emp;
    }

    const founderEmp = await makeUserEmployee(tenantId, FOUNDER, 'SUPER_ADMIN', roleIds.get('super_admin')!, 'F-1');
    const mgrEmp = await makeUserEmployee(tenantId, MGR, 'MANAGER', roleIds.get('manager')!, 'M-1');
    await makeUserEmployee(tenantId, EMP, 'EMPLOYEE', roleIds.get('employee')!, 'E-1', mgrEmp.id);
    void founderEmp;

    // Foreign-tenant employee + request (cross-tenant isolation check).
    const otherEmp = await makeUserEmployee(other.id, OTHER_EMP, 'EMPLOYEE', otherRoleIds.get('employee')!, 'O-1');
    const foreign = await db.paymentRequest.create({
      data: {
        tenantId: other.id,
        employeeId: otherEmp.id,
        type: 'REIMBURSEMENT',
        title: 'foreign',
        amount: 1000,
        currency: 'VND',
        status: 'PENDING',
        expenseDate: new Date('2026-06-20'),
      },
    });
    foreignRequestId = foreign.id;

    founderToken = await login(FOUNDER.email, FOUNDER.password);
    mgrToken = await login(MGR.email, MGR.password);
    empToken = await login(EMP.email, EMP.password);
    otherToken = await login(OTHER_EMP.email, OTHER_EMP.password, OTHER_SLUG);
  });

  // ---- Create + routing ----

  it('employee creates a request → 201 PENDING, 2 approval rows, step 1 = MANAGER', async () => {
    const res = await createReq(empToken);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.currentStep).toBe(1);
    expect(res.body.data.approvals).toHaveLength(2);
    expect(res.body.data.approvals[0].approverType).toBe('MANAGER');
    expect(res.body.data.approvals[1].roleKey).toBe('super_admin');
  });

  it('REIMBURSEMENT without expenseDate → 422 validation', async () => {
    const res = await request(app)
      .post('/api/v1/payment-requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ type: 'REIMBURSEMENT', title: 'x', amount: 1000 });
    expect(res.status).toBe(422);
  });

  // ---- Scope + RBAC ----

  it('employee scope=all → 403 (no review capability)', async () => {
    const res = await request(app)
      .get('/api/v1/payment-requests?scope=all')
      .set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });

  it('employee scope=mine → only own requests + totalAmount', async () => {
    const res = await request(app)
      .get('/api/v1/payment-requests?scope=mine')
      .set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(typeof res.body.data.totalAmount).toBe('string');
  });

  it('founder scope=all → sees tenant requests; manager review queue surfaces step-1 requests', async () => {
    const all = await request(app).get('/api/v1/payment-requests?scope=all').set('Authorization', `Bearer ${founderToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.items.length).toBeGreaterThan(0);

    const review = await request(app).get('/api/v1/payment-requests?scope=review').set('Authorization', `Bearer ${mgrToken}`);
    expect(review.status).toBe(200);
    expect(review.body.data.items.length).toBeGreaterThan(0); // manager is step-1 approver
  });

  // ---- Decision lifecycle ----

  it('full path: manager approve → founder approve → APPROVED → mark-paid → PAID', async () => {
    const created = await createReq(empToken);
    const id = created.body.data.id;

    // wrong actor: employee cannot approve (no perm) → 403
    const empApprove = await request(app).post(`/api/v1/payment-requests/${id}/approve`).set('Authorization', `Bearer ${empToken}`).send({});
    expect(empApprove.status).toBe(403);

    // manager approves step 1 → currentStep advances, still PENDING
    const a1 = await request(app).post(`/api/v1/payment-requests/${id}/approve`).set('Authorization', `Bearer ${mgrToken}`).send({});
    expect(a1.status).toBe(200);
    expect(a1.body.data.status).toBe('PENDING');
    expect(a1.body.data.currentStep).toBe(2);

    // manager cannot approve step 2 (not the super_admin role) → 403
    const mgrStep2 = await request(app).post(`/api/v1/payment-requests/${id}/approve`).set('Authorization', `Bearer ${mgrToken}`).send({});
    expect(mgrStep2.status).toBe(403);

    // founder approves final step → APPROVED
    const a2 = await request(app).post(`/api/v1/payment-requests/${id}/approve`).set('Authorization', `Bearer ${founderToken}`).send({});
    expect(a2.status).toBe(200);
    expect(a2.body.data.status).toBe('APPROVED');

    // employee cannot mark-paid (no perm) → 403
    const empPaid = await request(app).post(`/api/v1/payment-requests/${id}/mark-paid`).set('Authorization', `Bearer ${empToken}`).send({});
    expect(empPaid.status).toBe(403);

    // founder marks paid → PAID + paidBy recorded
    const paid = await request(app).post(`/api/v1/payment-requests/${id}/mark-paid`).set('Authorization', `Bearer ${founderToken}`).send({ paymentNote: 'CK 24/06' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.paidById).toBeTruthy();
    expect(paid.body.data.paymentNote).toBe('CK 24/06');
  });

  it('return → resubmit opens round 2; reject is terminal (resubmit blocked)', async () => {
    // return path
    const r1 = await createReq(empToken);
    const id1 = r1.body.data.id;
    const ret = await request(app).post(`/api/v1/payment-requests/${id1}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'return', note: 'Bổ sung hoá đơn' });
    expect(ret.status).toBe(200);
    expect(ret.body.data.status).toBe('RETURNED');

    const resub = await request(app).post(`/api/v1/payment-requests/${id1}/resubmit`).set('Authorization', `Bearer ${empToken}`).send({ ...REIMB, amount: 300000 });
    expect(resub.status).toBe(200);
    expect(resub.body.data.status).toBe('PENDING');
    const rounds = [...new Set(resub.body.data.approvals.map((a: { round: number }) => a.round))];
    expect(rounds).toContain(2);

    // reject path (terminal)
    const r2 = await createReq(empToken);
    const id2 = r2.body.data.id;
    const rej = await request(app).post(`/api/v1/payment-requests/${id2}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'reject', note: 'Không hợp lệ' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('REJECTED');

    const resubRejected = await request(app).post(`/api/v1/payment-requests/${id2}/resubmit`).set('Authorization', `Bearer ${empToken}`).send(REIMB);
    expect(resubRejected.status).toBe(400);
  });

  it('reject without a note → 422', async () => {
    const r = await createReq(empToken);
    const res = await request(app).post(`/api/v1/payment-requests/${r.body.data.id}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'reject', note: '' });
    expect(res.status).toBe(422);
  });

  it('owner cancels own PENDING request → CANCELLED', async () => {
    const r = await createReq(empToken);
    const res = await request(app).post(`/api/v1/payment-requests/${r.body.data.id}/cancel`).set('Authorization', `Bearer ${empToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  // ---- Attachments ----

  it('upload: rejects bad MIME, accepts image, then download streams it', async () => {
    const r = await createReq(empToken);
    const id = r.body.data.id;

    const bad = await request(app)
      .post(`/api/v1/payment-requests/${id}/attachments`)
      .set('Authorization', `Bearer ${empToken}`)
      .attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);

    const png = Buffer.from('\x89PNG fake bill');
    const ok = await request(app)
      .post(`/api/v1/payment-requests/${id}/attachments`)
      .set('Authorization', `Bearer ${empToken}`)
      .attach('file', png, { filename: 'bill.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    const attId = ok.body.data.id;

    // manager (review capability) can download
    const dl = await request(app)
      .get(`/api/v1/payment-requests/${id}/attachments/${attId}/download`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('image/png');
  });

  // ---- Statistics ----

  it('stats: employee → 403; founder → monthly + by-type/status breakdown', async () => {
    const year = new Date().getUTCFullYear();
    const emp = await request(app).get(`/api/v1/payment-requests/stats?year=${year}`).set('Authorization', `Bearer ${empToken}`);
    expect(emp.status).toBe(403);

    const res = await request(app).get(`/api/v1/payment-requests/stats?year=${year}`).set('Authorization', `Bearer ${founderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.year).toBe(year);
    expect(res.body.data.months).toHaveLength(12);
    expect(typeof res.body.data.grandTotal).toBe('string');
    expect(Number(res.body.data.grandCount)).toBeGreaterThan(0); // created several requests above
    expect(Array.isArray(res.body.data.byType)).toBe(true);
    expect(Array.isArray(res.body.data.byStatus)).toBe(true);
  });

  // ---- Export ----

  it('export: manager (no export perm) → 403; founder → xlsx with rows', async () => {
    const mgr = await request(app).get('/api/v1/payment-requests/export?scope=all').set('Authorization', `Bearer ${mgrToken}`);
    expect(mgr.status).toBe(403); // MANAGER lacks payment_request:export

    const res = await request(app)
      .get('/api/v1/payment-requests/export?scope=all')
      .set('Authorization', `Bearer ${founderToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    // .xlsx is a zip → starts with "PK"
    expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('export respects scope=mine (employee can export own list)', async () => {
    // employee has payment_request:create+view but NOT export → 403
    const emp = await request(app).get('/api/v1/payment-requests/export?scope=mine').set('Authorization', `Bearer ${empToken}`);
    expect(emp.status).toBe(403);
  });

  // ---- Cross-tenant isolation ----

  it('cannot read a request from another tenant → 404', async () => {
    const res = await request(app).get(`/api/v1/payment-requests/${foreignRequestId}`).set('Authorization', `Bearer ${founderToken}`);
    expect(res.status).toBe(404);
  });

  it('foreign employee cannot reach our tenant data via their token (scope=mine isolated)', async () => {
    const res = await request(app).get('/api/v1/payment-requests?scope=mine').set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    // their own tenant has only the seeded "foreign" request, never ours
    expect(res.body.data.items.every((i: { title: string }) => i.title === 'foreign')).toBe(true);
  });
});
