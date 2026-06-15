import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// Asset assignment lifecycle — cấp phát / thu hồi + self-service:
//   POST /assets/:id/assign  → assets:assign (HR); 409 if not AVAILABLE
//   POST /assets/:id/return  → assets:assign (HR); 409 if not ASSIGNED
//   GET  /assets/mine        → assets:view; only assets ACTIVE-assigned to caller
// Invariant: an asset has at most one ACTIVE assignment; status mirrors it
// (AVAILABLE ⇄ ASSIGNED).
const TENANT_SLUG = 'asset-assign-tenant';
const OTHER_SLUG = 'asset-assign-other';
const HR_EMAIL = 'hr@assign.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@assign.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.assetMaintenance.deleteMany({ where: { tenantId } });
  await db.assetAssignment.deleteMany({ where: { tenantId } });
  await db.asset.deleteMany({ where: { tenantId } });
  await db.assetCategory.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug = TENANT_SLUG): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug: slug });
  return res.body.data.accessToken;
}

describe('Asset assignment routes', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let categoryId: string;
  let hrEmployeeId: string; // who performs assignment (assignedById)
  let empEmployeeId: string; // the self-service employee (holder)
  let foreignAssetId: string;
  let foreignEmployeeId: string; // employee in the other tenant (isolation)

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Asset Assign Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Asset Assign Other', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    await syncSystemRolesForTenant(db, otherTenantId);

    const hrUser = await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    const empUser = await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Self Service Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const category = await db.assetCategory.create({
      data: { tenantId, name: 'Laptops', code: 'LAPTOP' },
    });
    categoryId = category.id;

    const hrEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'EMP-HR',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    hrEmployeeId = hrEmployee.id;

    const empEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: empUser.id,
        employeeCode: 'EMP-001',
        fullName: 'Self Service Employee',
        joinDate: new Date('2024-02-01'),
        contractType: 'FULL_TIME',
      },
    });
    empEmployeeId = empEmployee.id;

    // Other-tenant asset — must never leak / be assignable.
    const foreignCat = await db.assetCategory.create({
      data: { tenantId: otherTenantId, name: 'Foreign', code: 'FOREIGN' },
    });
    const foreignAsset = await db.asset.create({
      data: { tenantId: otherTenantId, categoryId: foreignCat.id, assetCode: 'FX-001', name: 'Foreign Laptop' },
    });
    foreignAssetId = foreignAsset.id;

    const foreignUser = await db.user.create({
      data: {
        tenantId: otherTenantId,
        email: 'foreign@assign.com',
        passwordHash: await hashPassword('ForeignTest@123'),
        fullName: 'Foreign Emp',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const foreignEmployee = await db.employee.create({
      data: {
        tenantId: otherTenantId,
        userId: foreignUser.id,
        employeeCode: 'X-EMP',
        fullName: 'Foreign Emp',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    foreignEmployeeId = foreignEmployee.id;

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await db.tenant.delete({ where: { id: otherTenantId } });
  });

  // Each test starts from a clean catalog of assets in the primary tenant.
  beforeEach(async () => {
    await db.assetAssignment.deleteMany({ where: { tenantId } });
    await db.asset.deleteMany({ where: { tenantId } });
  });

  async function createAsset(code: string, status: 'AVAILABLE' | 'ASSIGNED' = 'AVAILABLE') {
    return db.asset.create({
      data: { tenantId, categoryId, assetCode: code, name: `Asset ${code}`, status },
    });
  }

  describe('POST /assets/:id/assign', () => {
    it('assigns an AVAILABLE asset to an employee and flips status to ASSIGNED', async () => {
      const asset = await createAsset('LP-ASSIGN');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01', conditionOut: 'GOOD', note: 'Cấp laptop' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ASSIGNED');
      expect(res.body.data.currentAssignment).not.toBeNull();
      expect(res.body.data.currentAssignment.employeeId).toBe(empEmployeeId);
      expect(res.body.data.currentAssignment.status).toBe('ACTIVE');
      expect(res.body.data.currentAssignment.conditionOut).toBe('GOOD');

      // Exactly one ACTIVE assignment exists for the asset.
      const active = await db.assetAssignment.count({
        where: { assetId: asset.id, status: 'ACTIVE' },
      });
      expect(active).toBe(1);
      const fresh = await db.asset.findUnique({ where: { id: asset.id } });
      expect(fresh!.status).toBe('ASSIGNED');
    });

    it('returns 409 when assigning an asset that is already ASSIGNED (double-assign)', async () => {
      const asset = await createAsset('LP-DBL');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });

      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: hrEmployeeId, assignedAt: '2026-06-02' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_ASSIGNABLE');
      // Still exactly one ACTIVE assignment — the invariant held.
      const active = await db.assetAssignment.count({
        where: { assetId: asset.id, status: 'ACTIVE' },
      });
      expect(active).toBe(1);
    });

    it('returns 403 for EMPLOYEE (lacks assets:assign)', async () => {
      const asset = await createAsset('LP-EMP403');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for an asset in another tenant', async () => {
      const res = await request(app)
        .post(`/api/v1/assets/${foreignAssetId}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      expect(res.status).toBe(404);
    });

    it('returns 404 when the employee belongs to another tenant', async () => {
      const asset = await createAsset('LP-XEMP');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: foreignEmployeeId, assignedAt: '2026-06-01' });
      expect(res.status).toBe(404);
    });

    it('returns 422 on missing required fields', async () => {
      const asset = await createAsset('LP-422');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ note: 'no employee, no date' });
      expect(res.status).toBe(422);
    });

    // ── Handover acknowledgement at assign time (ON_SCREEN, SPEC-022) ─────────
    const PNG_DATA_URL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    it('captures an on-screen signature → handover SIGNED/ON_SCREEN, no PII leak', async () => {
      const asset = await createAsset('LP-SIGN');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01', signature: PNG_DATA_URL });

      expect(res.status).toBe(200);
      const dto = res.body.data.currentAssignment;
      expect(dto.ackStatus).toBe('SIGNED');
      expect(dto.ackMethod).toBe('ON_SCREEN');
      expect(dto.acknowledgedAt).not.toBeNull();
      expect(dto.hasSignature).toBe(true);
      // PII guard: the raw signature image must never be serialised to the client.
      expect(dto.signatureImage).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('iVBORw0KGgo');

      // Persisted: image stored, acknowledger recorded.
      const row = await db.assetAssignment.findFirst({ where: { assetId: asset.id } });
      expect(row!.signatureImage).toBe(PNG_DATA_URL);
      expect(row!.acknowledgedByUserId).not.toBeNull();
    });

    it('assigns without a signature → handover stays PENDING (sign later)', async () => {
      const asset = await createAsset('LP-PENDING');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });

      expect(res.status).toBe(200);
      const dto = res.body.data.currentAssignment;
      expect(dto.ackStatus).toBe('PENDING');
      expect(dto.ackMethod).toBeNull();
      expect(dto.hasSignature).toBe(false);
    });

    it('returns 422 when the signature payload is too large', async () => {
      const asset = await createAsset('LP-BIGSIG');
      const huge = 'data:image/png;base64,' + 'A'.repeat(360_001);
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01', signature: huge });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /assets/:id/return', () => {
    it('returns an ASSIGNED asset, closes the assignment and flips status to AVAILABLE', async () => {
      const asset = await createAsset('LP-RET');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });

      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ returnedAt: '2026-06-10', conditionIn: 'FAIR', note: 'Trầy nhẹ' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AVAILABLE');
      expect(res.body.data.currentAssignment).toBeNull();

      const active = await db.assetAssignment.count({
        where: { assetId: asset.id, status: 'ACTIVE' },
      });
      expect(active).toBe(0);
      const closed = await db.assetAssignment.findFirst({ where: { assetId: asset.id } });
      expect(closed!.status).toBe('RETURNED');
      expect(closed!.conditionIn).toBe('FAIR');
      expect(closed!.returnedById).toBe(hrEmployeeId);
    });

    it('returns 409 when the asset is not ASSIGNED (nothing to return)', async () => {
      const asset = await createAsset('LP-NORET');
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ returnedAt: '2026-06-10' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSET_NOT_RETURNABLE');
    });

    it('allows re-assigning after a return (full cycle)', async () => {
      const asset = await createAsset('LP-CYCLE');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      await request(app)
        .post(`/api/v1/assets/${asset.id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ returnedAt: '2026-06-05' });
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: hrEmployeeId, assignedAt: '2026-06-06' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ASSIGNED');
      // History preserved: one RETURNED + one ACTIVE.
      const all = await db.assetAssignment.findMany({ where: { assetId: asset.id } });
      expect(all).toHaveLength(2);
      expect(all.filter((a) => a.status === 'ACTIVE')).toHaveLength(1);
    });
  });

  describe('GET /assets/mine', () => {
    it('returns only assets ACTIVE-assigned to the calling employee', async () => {
      const mine = await createAsset('LP-MINE');
      const other = await createAsset('LP-OTHER');
      // Assign one to the employee, one to HR.
      await request(app)
        .post(`/api/v1/assets/${mine.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      await request(app)
        .post(`/api/v1/assets/${other.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: hrEmployeeId, assignedAt: '2026-06-01' });

      const res = await request(app)
        .get('/api/v1/assets/mine')
        .set('Authorization', `Bearer ${empToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].assetCode).toBe('LP-MINE');
      expect(res.body.data[0].currentAssignment.employeeId).toBe(empEmployeeId);
    });

    it('returns an empty list when the caller holds nothing', async () => {
      const res = await request(app)
        .get('/api/v1/assets/mine')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('excludes assets the employee returned (no longer ACTIVE)', async () => {
      const asset = await createAsset('LP-RETURNED');
      await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      await request(app)
        .post(`/api/v1/assets/${asset.id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ returnedAt: '2026-06-05' });

      const res = await request(app)
        .get('/api/v1/assets/mine')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── IN_APP remote acknowledgement (SPEC-022 Phase 3) ──────────────────────
  describe('POST /assets/assignments/:assignmentId/acknowledge', () => {
    const PNG_DATA_URL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    // Assign an asset to the self-service employee and return the PENDING
    // handover record's id (no signature captured at assign time).
    async function assignPending(code: string): Promise<string> {
      const asset = await createAsset(code);
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      return res.body.data.currentAssignment.id;
    }

    it('lets the assignee sign a PENDING handover → SIGNED/IN_APP, no PII leak', async () => {
      const assignmentId = await assignPending('LP-ACK');
      const res = await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });

      expect(res.status).toBe(200);
      const dto = res.body.data;
      expect(dto.ackStatus).toBe('SIGNED');
      expect(dto.ackMethod).toBe('IN_APP');
      expect(dto.acknowledgedAt).not.toBeNull();
      expect(dto.hasSignature).toBe(true);
      // PII guard: the raw image is never serialised.
      expect(dto.signatureImage).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('iVBORw0KGgo');

      // Persisted: image stored, the signing user recorded.
      const row = await db.assetAssignment.findUnique({ where: { id: assignmentId } });
      expect(row!.signatureImage).toBe(PNG_DATA_URL);
      expect(row!.ackMethod).toBe('IN_APP');
      expect(row!.acknowledgedByUserId).not.toBeNull();
    });

    it('returns 403 when a non-assignee tries to acknowledge', async () => {
      // HR has assets:acknowledge but is not the assignee → ownership blocks it.
      const assignmentId = await assignPending('LP-ACK403');
      const res = await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ signature: PNG_DATA_URL });

      expect(res.status).toBe(403);
      // Untouched — still PENDING, no signature.
      const row = await db.assetAssignment.findUnique({ where: { id: assignmentId } });
      expect(row!.ackStatus).toBe('PENDING');
      expect(row!.signatureImage).toBeNull();
    });

    it('returns 409 when the handover is already signed', async () => {
      const assignmentId = await assignPending('LP-ACK409');
      await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });

      const res = await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_ACKNOWLEDGED');
    });

    it('serialises two concurrent signs: exactly one wins (CAS guards the double-sign)', async () => {
      const assignmentId = await assignPending('LP-ACKRACE');

      // Fire both before either resolves — both pass the read pre-checks, but
      // the guarded write only stamps a still-PENDING row, so one must lose.
      const [a, b] = await Promise.all([
        request(app)
          .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
          .set('Authorization', `Bearer ${empToken}`)
          .send({ signature: PNG_DATA_URL }),
        request(app)
          .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
          .set('Authorization', `Bearer ${empToken}`)
          .send({ signature: PNG_DATA_URL }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.error.code).toBe('ALREADY_ACKNOWLEDGED');

      // Single signed row, no double-stamp.
      const row = await db.assetAssignment.findUnique({ where: { id: assignmentId } });
      expect(row!.ackStatus).toBe('SIGNED');
      expect(row!.ackMethod).toBe('IN_APP');
    });

    it('returns 409 when the handover is no longer ACTIVE (asset returned)', async () => {
      const asset = await createAsset('LP-ACKRET');
      const assignRes = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      const assignmentId = assignRes.body.data.currentAssignment.id;
      await request(app)
        .post(`/api/v1/assets/${asset.id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ returnedAt: '2026-06-05' });

      const res = await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSIGNMENT_NOT_ACTIVE');
    });

    it('returns 404 for a handover record in another tenant (isolation)', async () => {
      const foreignAssignment = await db.assetAssignment.create({
        data: {
          tenantId: otherTenantId,
          assetId: foreignAssetId,
          employeeId: foreignEmployeeId,
          assignedById: foreignEmployeeId,
          assignedAt: new Date('2026-06-01'),
          status: 'ACTIVE',
          ackStatus: 'PENDING',
        },
      });
      const res = await request(app)
        .post(`/api/v1/assets/assignments/${foreignAssignment.id}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });

      expect(res.status).toBe(404);
      await db.assetAssignment.delete({ where: { id: foreignAssignment.id } });
    });

    it('returns 422 when the signature is missing', async () => {
      const assignmentId = await assignPending('LP-ACK422');
      const res = await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({});
      expect(res.status).toBe(422);
    });
  });

  // ── Handover record PDF (SPEC-022 Phase 4) ────────────────────────────────
  describe('GET /assets/assignments/:assignmentId/handover.pdf', () => {
    // superagent only auto-buffers text/json; force a binary buffer so we can
    // assert on the raw PDF bytes.
    function binaryParser(res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void) {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    }

    async function assignTo(code: string, employeeId: string): Promise<string> {
      const asset = await createAsset(code);
      const res = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId, assignedAt: '2026-06-01' });
      return res.body.data.currentAssignment.id;
    }

    it('lets the assignee download their own handover record as a PDF', async () => {
      const assignmentId = await assignTo('LP-PDF', empEmployeeId);
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/handover.pdf`)
        .set('Authorization', `Bearer ${empToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('bien-ban-ban-giao-LP-PDF.pdf');
      expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('lets HR (assets:assign) download any handover record', async () => {
      const assignmentId = await assignTo('LP-PDF-HR', empEmployeeId);
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/handover.pdf`)
        .set('Authorization', `Bearer ${hrToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('returns 403 when a non-owner without assets:assign requests the PDF', async () => {
      // A second employee in the same tenant: has assets:view but not the record.
      const employeeRole = await db.role.findFirst({ where: { tenantId, key: 'employee' } });
      const otherUser = await db.user.create({
        data: {
          tenantId,
          email: 'emp2@assign.com',
          passwordHash: await hashPassword('Emp2Test@123'),
          fullName: 'Other Employee',
          role: 'EMPLOYEE',
          roleId: employeeRole!.id,
          status: 'ACTIVE',
        },
      });
      await db.employee.create({
        data: {
          tenantId,
          userId: otherUser.id,
          employeeCode: 'EMP-002',
          fullName: 'Other Employee',
          joinDate: new Date('2024-03-01'),
          contractType: 'FULL_TIME',
        },
      });
      const otherToken = await login('emp2@assign.com', 'Emp2Test@123');

      const assignmentId = await assignTo('LP-PDF-403', empEmployeeId);
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/handover.pdf`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);

      await db.employee.deleteMany({ where: { userId: otherUser.id } });
      await db.refreshToken.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    });

    it('returns 404 for a handover record in another tenant (isolation)', async () => {
      const foreignAssignment = await db.assetAssignment.create({
        data: {
          tenantId: otherTenantId,
          assetId: foreignAssetId,
          employeeId: foreignEmployeeId,
          assignedById: foreignEmployeeId,
          assignedAt: new Date('2026-06-01'),
          status: 'ACTIVE',
          ackStatus: 'PENDING',
        },
      });
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${foreignAssignment.id}/handover.pdf`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(404);
      await db.assetAssignment.delete({ where: { id: foreignAssignment.id } });
    });
  });

  // ── Handover signature image (SPEC-022 follow-up) ─────────────────────────
  describe('GET /assets/assignments/:assignmentId/signature', () => {
    const PNG_DATA_URL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    function binaryParser(res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void) {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    }

    // Assign to the self-service employee, then sign IN_APP → returns a SIGNED id.
    async function assignAndSign(code: string): Promise<string> {
      const asset = await createAsset(code);
      const assignRes = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      const assignmentId = assignRes.body.data.currentAssignment.id;
      await request(app)
        .post(`/api/v1/assets/assignments/${assignmentId}/acknowledge`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ signature: PNG_DATA_URL });
      return assignmentId;
    }

    it('serves the signature PNG to the assignee who signed it', async () => {
      const assignmentId = await assignAndSign('LP-SIG');
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/signature`)
        .set('Authorization', `Bearer ${empToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['cache-control']).toContain('no-store');
      // PNG magic bytes: 0x89 'P' 'N' 'G'.
      expect(res.body[0]).toBe(0x89);
      expect(res.body.subarray(1, 4).toString('latin1')).toBe('PNG');
    });

    it('serves the signature to HR (assets:assign) for any handover', async () => {
      const assignmentId = await assignAndSign('LP-SIG-HR');
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/signature`)
        .set('Authorization', `Bearer ${hrToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.body[0]).toBe(0x89);
    });

    it('returns 403 when a non-owner without assets:assign requests the signature', async () => {
      const employeeRole = await db.role.findFirst({ where: { tenantId, key: 'employee' } });
      const otherUser = await db.user.create({
        data: {
          tenantId,
          email: 'emp3@assign.com',
          passwordHash: await hashPassword('Emp3Test@123'),
          fullName: 'Third Employee',
          role: 'EMPLOYEE',
          roleId: employeeRole!.id,
          status: 'ACTIVE',
        },
      });
      await db.employee.create({
        data: {
          tenantId,
          userId: otherUser.id,
          employeeCode: 'EMP-003',
          fullName: 'Third Employee',
          joinDate: new Date('2024-03-01'),
          contractType: 'FULL_TIME',
        },
      });
      const otherToken = await login('emp3@assign.com', 'Emp3Test@123');

      const assignmentId = await assignAndSign('LP-SIG-403');
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/signature`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);

      await db.employee.deleteMany({ where: { userId: otherUser.id } });
      await db.refreshToken.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    });

    it('returns 404 for a PENDING handover that has no signature yet', async () => {
      const asset = await createAsset('LP-SIG-PENDING');
      const assignRes = await request(app)
        .post(`/api/v1/assets/${asset.id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: empEmployeeId, assignedAt: '2026-06-01' });
      const assignmentId = assignRes.body.data.currentAssignment.id;

      const res = await request(app)
        .get(`/api/v1/assets/assignments/${assignmentId}/signature`)
        .set('Authorization', `Bearer ${empToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a handover record in another tenant (isolation)', async () => {
      const foreignAssignment = await db.assetAssignment.create({
        data: {
          tenantId: otherTenantId,
          assetId: foreignAssetId,
          employeeId: foreignEmployeeId,
          assignedById: foreignEmployeeId,
          assignedAt: new Date('2026-06-01'),
          status: 'ACTIVE',
          ackStatus: 'SIGNED',
          ackMethod: 'IN_APP',
          signatureImage: PNG_DATA_URL,
        },
      });
      const res = await request(app)
        .get(`/api/v1/assets/assignments/${foreignAssignment.id}/signature`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(404);
      await db.assetAssignment.delete({ where: { id: foreignAssignment.id } });
    });
  });
});
