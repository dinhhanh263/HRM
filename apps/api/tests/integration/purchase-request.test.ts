import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultPurchaseFlowForTenant } from '../../src/domain/purchase-request/defaults.js';

// Purchase Request lifecycle + RBAC (SPEC-042):
//   create (3 dòng VAT khác nhau) → manager approve → founder approve → APPROVED
//     → mark-ordered → ORDERED; PDF downloadable; server recomputes totals.
//   return → resubmit (round 2);  reject → terminal; scope mine/review/all;
//   cross-tenant isolation.
const SLUG = 'pur-it-tenant';
const OTHER_SLUG = 'pur-it-other';
const FOUNDER = { email: 'founder@pur.com', password: 'Founder@123' };
const MGR = { email: 'mgr@pur.com', password: 'Manager@123' };
const EMP = { email: 'emp@pur.com', password: 'Employee@123' };
const OTHER_EMP = { email: 'other@pur.com', password: 'Other@123' };

async function cleanup(tenantId: string) {
  await db.purchaseRequestApproval.deleteMany({ where: { tenantId } });
  await db.purchaseRequestAttachment.deleteMany({ where: { request: { tenantId } } });
  await db.purchaseRequestItem.deleteMany({ where: { request: { tenantId } } });
  await db.purchaseRequest.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
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

// 3 lines, mixed VAT — subtotal 1.300.000 / VAT 74.000 / total 1.374.000.
const PURCHASE = {
  title: 'Mua vật tư văn phòng',
  vendorName: 'Công ty Văn phòng phẩm ABC',
  items: [
    { productName: 'Giấy A4', unit: 'thùng', quantity: 3, unitPrice: 100000, taxRate: 8 },
    { productName: 'Mực in', unit: 'hộp', quantity: 1, unitPrice: 500000, taxRate: 10 },
    { productName: 'Bút bi', unit: 'hộp', quantity: 2, unitPrice: 250000, taxRate: 0 },
  ],
};

async function createReq(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/purchase-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...PURCHASE, ...overrides });
}

describe('Purchase Request routes (RBAC + lifecycle + totals + PDF)', () => {
  let tenantId: string;
  let founderToken: string;
  let mgrToken: string;
  let empToken: string;
  let otherToken: string;
  let foreignRequestId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Pur IT', slug: SLUG } });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({ where: { slug: OTHER_SLUG }, update: {}, create: { name: 'Pur Other', slug: OTHER_SLUG } });
    await cleanup(tenantId);
    await cleanup(other.id);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIds = await syncSystemRolesForTenant(db, other.id);
    await seedDefaultPurchaseFlowForTenant(db, tenantId);
    await seedDefaultPurchaseFlowForTenant(db, other.id);

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
    const foreign = await db.purchaseRequest.create({
      data: {
        tenantId: other.id,
        employeeId: otherEmp.id,
        code: 'PR-20260101-001',
        title: 'foreign',
        vendorName: 'foreign vendor',
        currency: 'VND',
        status: 'PENDING',
        subtotal: 1000,
        taxAmount: 80,
        totalAmount: 1080,
      },
    });
    foreignRequestId = foreign.id;

    founderToken = await login(FOUNDER.email, FOUNDER.password);
    mgrToken = await login(MGR.email, MGR.password);
    empToken = await login(EMP.email, EMP.password);
    otherToken = await login(OTHER_EMP.email, OTHER_EMP.password, OTHER_SLUG);
  });

  // ---- Create + totals + code + routing ----

  it('employee creates a request → 201 PENDING, code PR-..., server recomputes totals, step 1 = MANAGER', async () => {
    const res = await createReq(empToken);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.currentStep).toBe(1);
    expect(res.body.data.code).toMatch(/^PR-\d{8}-\d{3}$/);
    expect(res.body.data.items).toHaveLength(3);
    // server-computed totals (ignores any client total)
    expect(Number(res.body.data.subtotal)).toBe(1300000);
    expect(Number(res.body.data.taxAmount)).toBe(74000);
    expect(Number(res.body.data.totalAmount)).toBe(1374000);
    expect(res.body.data.approvals).toHaveLength(2);
    expect(res.body.data.approvals[0].approverType).toBe('MANAGER');
    expect(res.body.data.approvals[1].roleKey).toBe('super_admin');
  });

  it('no line items → 422 validation', async () => {
    const res = await createReq(empToken, { items: [] });
    expect(res.status).toBe(422);
  });

  it('missing vendorName → 422 validation', async () => {
    const res = await createReq(empToken, { vendorName: '' });
    expect(res.status).toBe(422);
  });

  // ---- Scope + RBAC ----

  it('employee scope=all → 403 (no review capability)', async () => {
    const res = await request(app).get('/api/v1/purchase-requests?scope=all').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });

  it('employee scope=mine → only own requests + totalAmount', async () => {
    const res = await request(app).get('/api/v1/purchase-requests?scope=mine').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(typeof res.body.data.totalAmount).toBe('string');
  });

  it('founder scope=all sees tenant requests; manager review queue surfaces step-1 requests', async () => {
    const all = await request(app).get('/api/v1/purchase-requests?scope=all').set('Authorization', `Bearer ${founderToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.items.length).toBeGreaterThan(0);

    const review = await request(app).get('/api/v1/purchase-requests?scope=review').set('Authorization', `Bearer ${mgrToken}`);
    expect(review.status).toBe(200);
    expect(review.body.data.items.length).toBeGreaterThan(0);
  });

  // ---- Decision lifecycle (critical path) ----

  it('full path: manager approve → founder approve → APPROVED → mark-ordered → ORDERED', async () => {
    const created = await createReq(empToken);
    const id = created.body.data.id;

    // employee cannot approve (no perm) → 403
    const empApprove = await request(app).post(`/api/v1/purchase-requests/${id}/approve`).set('Authorization', `Bearer ${empToken}`).send({});
    expect(empApprove.status).toBe(403);

    // manager approves step 1 → still PENDING, step 2
    const mgrApprove = await request(app).post(`/api/v1/purchase-requests/${id}/approve`).set('Authorization', `Bearer ${mgrToken}`).send({});
    expect(mgrApprove.status).toBe(200);
    expect(mgrApprove.body.data.status).toBe('PENDING');
    expect(mgrApprove.body.data.currentStep).toBe(2);

    // founder approves final step → APPROVED
    const founderApprove = await request(app).post(`/api/v1/purchase-requests/${id}/approve`).set('Authorization', `Bearer ${founderToken}`).send({});
    expect(founderApprove.status).toBe(200);
    expect(founderApprove.body.data.status).toBe('APPROVED');

    // cannot mark-ordered without perm (manager lacks mark_ordered) → 403
    const mgrOrder = await request(app).post(`/api/v1/purchase-requests/${id}/mark-ordered`).set('Authorization', `Bearer ${mgrToken}`).send({});
    expect(mgrOrder.status).toBe(403);

    // founder marks ordered → ORDERED
    const order = await request(app).post(`/api/v1/purchase-requests/${id}/mark-ordered`).set('Authorization', `Bearer ${founderToken}`).send({ orderNote: 'PO-2026-07' });
    expect(order.status).toBe(200);
    expect(order.body.data.status).toBe('ORDERED');
    expect(order.body.data.orderNote).toBe('PO-2026-07');
  });

  it('return → owner resubmit (round 2), then reject is terminal', async () => {
    const created = await createReq(empToken);
    const id = created.body.data.id;

    // return requires a note
    const noNote = await request(app).post(`/api/v1/purchase-requests/${id}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'return', note: '' });
    expect(noNote.status).toBe(422);

    const returned = await request(app).post(`/api/v1/purchase-requests/${id}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'return', note: 'Bổ sung báo giá' });
    expect(returned.status).toBe(200);
    expect(returned.body.data.status).toBe('RETURNED');

    // owner resubmits with edited items → PENDING again, round 2
    const resubmit = await request(app).post(`/api/v1/purchase-requests/${id}/resubmit`).set('Authorization', `Bearer ${empToken}`).send({
      ...PURCHASE,
      items: [{ productName: 'Giấy A4 (đã thêm báo giá)', unit: 'thùng', quantity: 5, unitPrice: 100000, taxRate: 8 }],
    });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.data.status).toBe('PENDING');
    expect(Number(resubmit.body.data.subtotal)).toBe(500000);
    expect(resubmit.body.data.items).toHaveLength(1);
    const maxRound = Math.max(...resubmit.body.data.approvals.map((a: { round: number }) => a.round));
    expect(maxRound).toBe(2);

    // manager rejects → REJECTED terminal; resubmit blocked
    const rejected = await request(app).post(`/api/v1/purchase-requests/${id}/reject`).set('Authorization', `Bearer ${mgrToken}`).send({ mode: 'reject', note: 'Giá quá cao' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');

    const reResubmit = await request(app).post(`/api/v1/purchase-requests/${id}/resubmit`).set('Authorization', `Bearer ${empToken}`).send(PURCHASE);
    expect(reResubmit.status).toBe(400);
  });

  // ---- PDF ----

  it('GET /:id/pdf → application/pdf with filename <code>.pdf', async () => {
    const created = await createReq(empToken);
    const id = created.body.data.id;
    const code = created.body.data.code;
    const res = await request(app).get(`/api/v1/purchase-requests/${id}/pdf`).set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`${code}.pdf`);
    expect(res.body.length ?? res.body.byteLength).toBeGreaterThan(1000);
  });

  // ---- Stats + Export ----

  it('stats: founder sees yearly aggregates (months/status/department/vendor)', async () => {
    const year = new Date().getUTCFullYear();
    const res = await request(app).get(`/api/v1/purchase-requests/stats?year=${year}`).set('Authorization', `Bearer ${founderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.months).toHaveLength(12);
    expect(Array.isArray(res.body.data.byVendor)).toBe(true);
    expect(Array.isArray(res.body.data.byDepartment)).toBe(true);
  });

  it('export: employee lacks purchase_request:export → 403', async () => {
    const res = await request(app).get('/api/v1/purchase-requests/export?scope=mine').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });

  it('export: founder gets an xlsx', async () => {
    const res = await request(app).get('/api/v1/purchase-requests/export?scope=all').set('Authorization', `Bearer ${founderToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  // ---- Cross-tenant isolation ----

  it('cannot read a foreign-tenant request → 404', async () => {
    const res = await request(app).get(`/api/v1/purchase-requests/${foreignRequestId}`).set('Authorization', `Bearer ${founderToken}`);
    expect(res.status).toBe(404);
    void otherToken;
  });

  // ---- SPEC-043: issuing-entity snapshot + fallback + tenant scope ----

  describe('issuing entity snapshot (SPEC-043)', () => {
    let entityId: string;
    let foreignEntityId: string;

    beforeAll(async () => {
      const entity = await db.issuingEntity.create({
        data: {
          tenantId,
          name: 'Hale JSC',
          address: '99 Hale Street',
          taxCode: '0999888777',
          phone: '0900000000',
          isDefault: true,
          active: true,
        },
      });
      entityId = entity.id;

      const other = await db.tenant.findUniqueOrThrow({ where: { slug: OTHER_SLUG } });
      const foreign = await db.issuingEntity.create({
        data: { tenantId: other.id, name: 'Foreign Entity', active: true },
      });
      foreignEntityId = foreign.id;
    });

    it('snapshots the entity fields onto the request on create', async () => {
      const res = await createReq(empToken, { issuingEntityId: entityId });
      expect(res.status).toBe(201);
      expect(res.body.data.issuingEntityId).toBe(entityId);
      expect(res.body.data.issuingCompanyName).toBe('Hale JSC');
      expect(res.body.data.issuingAddress).toBe('99 Hale Street');
      expect(res.body.data.issuingTaxCode).toBe('0999888777');
      expect(res.body.data.issuingPhone).toBe('0900000000');
      // Editing the entity afterwards must NOT change the frozen snapshot.
      await db.issuingEntity.update({ where: { id: entityId }, data: { name: 'Renamed Co' } });
      const detail = await request(app)
        .get(`/api/v1/purchase-requests/${res.body.data.id}`)
        .set('Authorization', `Bearer ${empToken}`);
      expect(detail.body.data.issuingCompanyName).toBe('Hale JSC');
      // restore
      await db.issuingEntity.update({ where: { id: entityId }, data: { name: 'Hale JSC' } });
    });

    it('leaves snapshot null when no entity is chosen (fallback to settings.company)', async () => {
      const res = await createReq(empToken);
      expect(res.status).toBe(201);
      expect(res.body.data.issuingEntityId).toBeNull();
      expect(res.body.data.issuingCompanyName).toBeNull();
      // PDF still renders (fallback path) — valid %PDF.
      const pdf = await request(app)
        .get(`/api/v1/purchase-requests/${res.body.data.id}/pdf`)
        .set('Authorization', `Bearer ${empToken}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
    });

    it('rejects an entity from another tenant (400, never snapshots)', async () => {
      const res = await createReq(empToken, { issuingEntityId: foreignEntityId });
      expect(res.status).toBe(400);
    });

    it('rejects an inactive entity on create (400)', async () => {
      const hidden = await db.issuingEntity.create({
        data: { tenantId, name: 'Hidden Co', active: false },
      });
      const res = await createReq(empToken, { issuingEntityId: hidden.id });
      expect(res.status).toBe(400);
    });

    it('re-snapshots on update', async () => {
      const created = await createReq(empToken, { issuingEntityId: entityId });
      const id = created.body.data.id;
      const updated = await request(app)
        .patch(`/api/v1/purchase-requests/${id}`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ ...PURCHASE, issuingEntityId: null });
      expect(updated.status).toBe(200);
      expect(updated.body.data.issuingEntityId).toBeNull();
      expect(updated.body.data.issuingCompanyName).toBeNull();
    });
  });
});
