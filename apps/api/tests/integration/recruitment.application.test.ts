import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-app-tenant';
const HR_EMAIL = 'hr@recruitment-app.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-app.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Sàng lọc', order: 1, type: 'SCREEN' },
  { name: 'Phỏng vấn', order: 2, type: 'INTERVIEW' },
  { name: 'Đề nghị', order: 3, type: 'OFFER' },
  { name: 'Đã tuyển', order: 4, type: 'HIRED' },
  { name: 'Từ chối', order: 5, type: 'REJECTED' },
];

const MANAGER_EMAIL = 'manager@recruitment-app.com';
const MANAGER_PASSWORD = 'MgrTest@123';

async function cleanup(tenantId: string) {
  // Interviews + scorecards feed the OFFER gate; clear them before applications.
  await db.scorecard.deleteMany({ where: { interview: { tenantId } } });
  await db.interviewInterviewer.deleteMany({ where: { interview: { tenantId } } });
  await db.interview.deleteMany({ where: { tenantId } });
  await db.applicationActivity.deleteMany({ where: { application: { tenantId } } });
  await db.applicationStageHistory.deleteMany({ where: { application: { tenantId } } });
  await db.application.deleteMany({ where: { tenantId } });
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.job.deleteMany({ where: { tenantId } });
  await db.pipelineTemplate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Recruitment API — applications', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let managerToken: string;
  let hrEmployeeId: string;
  let jobId: string;
  let firstStageId: string;
  let candidateId: string;
  let stagesSorted: { id: string; type: string; order: number }[];

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Application Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

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
    // Application stage-history ownership requires the actor to have an Employee.
    const hrEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'HR-001',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    hrEmployeeId = hrEmployee.id;

    // A MANAGER holds recruitment:application_move but NOT application_force_move —
    // the role used to prove force=true is ignored without the capability.
    const managerUser = await db.user.create({
      data: {
        tenantId,
        email: MANAGER_EMAIL,
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        fullName: 'Line Manager',
        role: 'MANAGER',
        roleId: roleIdByKey.get('manager'),
        status: 'ACTIVE',
      },
    });
    await db.employee.create({
      data: {
        tenantId,
        userId: managerUser.id,
        employeeCode: 'MGR-001',
        fullName: 'Line Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });

    const noAccessRole = await db.role.create({
      data: { tenantId, key: 'no-access', name: 'No Access', isSystem: false },
    });
    await db.user.create({
      data: {
        tenantId,
        email: NOACCESS_EMAIL,
        passwordHash: await hashPassword(NOACCESS_PASSWORD),
        fullName: 'No Access',
        role: 'EMPLOYEE',
        roleId: noAccessRole.id,
        status: 'ACTIVE',
      },
    });

    const template = await db.pipelineTemplate.create({
      data: { tenantId, name: 'Quy trình test', isDefault: true, stages: { create: validStages } },
    });

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;

    const managerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: MANAGER_EMAIL, password: MANAGER_PASSWORD, tenantSlug: TENANT_SLUG });
    managerToken = managerLogin.body.data.accessToken;

    const job = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set(auth(hrToken))
      .send({ title: 'Backend Developer', pipelineTemplateId: template.id, status: 'OPEN' });
    jobId = job.body.data.id;
    stagesSorted = [...job.body.data.stages].sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order
    );
    firstStageId = stagesSorted[0].id;

    const candidate = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Nguyễn Văn Ứng', email: 'ung.nguyen@example.com', source: 'REFERRAL' });
    candidateId = candidate.body.data.id;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('creates an application at the first pipeline stage and records stage history', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(hrToken))
      .send({ candidateId, jobId, source: 'JOB_BOARD' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.currentStageId).toBe(firstStageId);
    expect(res.body.data.currentStage.type).toBe('SOURCED');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.source).toBe('JOB_BOARD');

    // The opening history row (from=null) is the basis for velocity analytics.
    const history = await db.applicationStageHistory.findMany({
      where: { applicationId: res.body.data.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0].fromStageId).toBeNull();
    expect(history[0].toStageId).toBe(firstStageId);
  });

  it('blocks a second active application for the same (candidate, job) with 409', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(hrToken))
      .send({ candidateId, jobId });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPLICATION_DUPLICATE_ACTIVE');
  });

  it('defaults the application source to the candidate source when omitted', async () => {
    const other = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Trần Thị Nguồn', source: 'AGENCY' });

    const res = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(hrToken))
      .send({ candidateId: other.body.data.id, jobId });

    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe('AGENCY');
  });

  it('lists applications for a candidate with job + stage summaries', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/applications`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].job.title).toBe('Backend Developer');
    expect(res.body.data[0].currentStage.type).toBe('SOURCED');
  });

  it('lists applications for a job', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/jobs/${jobId}/applications`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects create for a user without recruitment:application_create (403)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(noAccessToken))
      .send({ candidateId, jobId });

    expect(res.status).toBe(403);
  });

  describe('moving an application through stages', () => {
    let moveAppId: string;

    beforeAll(async () => {
      // A fresh candidate keeps this flow isolated from the create-flow tests.
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: 'Phạm Thị Di Chuyển', source: 'DIRECT' });
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: cand.body.data.id, jobId });
      moveAppId = created.body.data.id;
    });

    it('moves to the next stage and appends an ordered history row + STAGE_CHANGED activity', async () => {
      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${moveAppId}/move`)
        .set(auth(hrToken))
        .send({ toStageId: stagesSorted[1].id, note: 'Qua vòng sàng lọc' });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStageId).toBe(stagesSorted[1].id);
      expect(res.body.data.currentStage.type).toBe('SCREEN');

      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: moveAppId },
        orderBy: { changedAt: 'asc' },
      });
      // Opening row (from=null→stage0) then the move row (stage0→stage1).
      expect(history).toHaveLength(2);
      expect(history[0].fromStageId).toBeNull();
      expect(history[0].toStageId).toBe(stagesSorted[0].id);
      expect(history[1].fromStageId).toBe(stagesSorted[0].id);
      expect(history[1].toStageId).toBe(stagesSorted[1].id);
      expect(history[1].note).toBe('Qua vòng sàng lọc');

      const activities = await db.applicationActivity.findMany({
        where: { applicationId: moveAppId, type: 'STAGE_CHANGED' },
      });
      expect(activities).toHaveLength(1);
    });

    it('records a second move so history is a complete ordered trail', async () => {
      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${moveAppId}/move`)
        .set(auth(hrToken))
        .send({ toStageId: stagesSorted[2].id });

      expect(res.status).toBe(200);

      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: moveAppId },
        orderBy: { changedAt: 'asc' },
      });
      expect(history).toHaveLength(3);
      expect(history[2].fromStageId).toBe(stagesSorted[1].id);
      expect(history[2].toStageId).toBe(stagesSorted[2].id);
    });

    it('rejects a no-op move to the current stage with 409', async () => {
      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${moveAppId}/move`)
        .set(auth(hrToken))
        .send({ toStageId: stagesSorted[2].id });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_STAGE_UNCHANGED');
    });

    it('rejects a move to a stage from another job with 422', async () => {
      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${moveAppId}/move`)
        .set(auth(hrToken))
        .send({ toStageId: 'stage-does-not-exist' });

      expect(res.status).toBe(422);
    });

    it('rejects a move for a user without recruitment:application_move (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${moveAppId}/move`)
        .set(auth(noAccessToken))
        .send({ toStageId: stagesSorted[0].id });

      expect(res.status).toBe(403);
    });
  });

  describe('concurrency invariants', () => {
    async function freshCandidate(name: string) {
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: name, source: 'DIRECT' });
      return cand.body.data.id as string;
    }

    it('two simultaneous moves from the same stage record exactly one transition (one 200, one 409)', async () => {
      const candId = await freshCandidate('Đoàn Văn Đua Tranh');
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: candId, jobId });
      const appId = created.body.data.id as string;

      // Fire two identical moves stage0 → stage1 at once. Both pass the read-time
      // guard, so only the atomic compare-and-swap in the repo can serialize them.
      const [a, b] = await Promise.all([
        request(app)
          .patch(`/api/v1/recruitment/applications/${appId}/move`)
          .set(auth(hrToken))
          .send({ toStageId: stagesSorted[1].id }),
        request(app)
          .patch(`/api/v1/recruitment/applications/${appId}/move`)
          .set(auth(hrToken))
          .send({ toStageId: stagesSorted[1].id }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);

      // The audit trail must hold only the opening row + a single move row — never
      // two contradictory transitions.
      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: appId },
      });
      expect(history).toHaveLength(2);
      const stageChanged = await db.applicationActivity.findMany({
        where: { applicationId: appId, type: 'STAGE_CHANGED' },
      });
      expect(stageChanged).toHaveLength(1);
    });

    it('two simultaneous applications for the same (candidate, job) create exactly one row', async () => {
      const candId = await freshCandidate('Hồ Thị Trùng Lặp');

      const [a, b] = await Promise.all([
        request(app)
          .post('/api/v1/recruitment/applications')
          .set(auth(hrToken))
          .send({ candidateId: candId, jobId }),
        request(app)
          .post('/api/v1/recruitment/applications')
          .set(auth(hrToken))
          .send({ candidateId: candId, jobId }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);

      const rows = await db.application.findMany({
        where: { tenantId, candidateId: candId, jobId, status: 'ACTIVE' },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('disposing an application (reject / hire / withdraw)', () => {
    // Each disposition test owns a fresh application so the terminal status of
    // one flow never bleeds into another.
    async function freshApplication(name: string) {
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: name, source: 'DIRECT' });
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: cand.body.data.id, jobId });
      return created.body.data.id as string;
    }

    it('rejects an application: keeps the stage, sets the reason, records a REJECTED activity', async () => {
      const appId = await freshApplication('Lê Văn Từ Chối');

      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/reject`)
        .set(auth(hrToken))
        .send({ rejectionReason: 'FAILED_ASSESSMENT', note: 'Không đạt bài test' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe('FAILED_ASSESSMENT');
      // Reject freezes the stage where the candidate dropped — the funnel must
      // still show it, so currentStage stays at the first (SOURCED) stage.
      expect(res.body.data.currentStageId).toBe(stagesSorted[0].id);

      // No stage transition is recorded — only the opening history row remains.
      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: appId },
      });
      expect(history).toHaveLength(1);

      const activities = await db.applicationActivity.findMany({
        where: { applicationId: appId, type: 'REJECTED' },
      });
      expect(activities).toHaveLength(1);
      expect(activities[0].body).toBe('Không đạt bài test');
    });

    it('hires an application: moves to the HIRED stage, closes it, appends stage history', async () => {
      const appId = await freshApplication('Đỗ Thị Được Tuyển');
      const hiredStage = stagesSorted.find((s) => s.type === 'HIRED')!;

      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/hire`)
        .set(auth(hrToken))
        .send({ note: 'Offer chấp nhận' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('HIRED');
      expect(res.body.data.currentStageId).toBe(hiredStage.id);
      expect(res.body.data.currentStage.type).toBe('HIRED');

      // The trail ends at HIRED: opening row + the move-to-hired row.
      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: appId },
        orderBy: { changedAt: 'asc' },
      });
      expect(history).toHaveLength(2);
      expect(history[1].fromStageId).toBe(stagesSorted[0].id);
      expect(history[1].toStageId).toBe(hiredStage.id);

      const activities = await db.applicationActivity.findMany({
        where: { applicationId: appId, type: 'HIRED' },
      });
      expect(activities).toHaveLength(1);
    });

    it('withdraws an application: closes as WITHDRAWN keeping the stage', async () => {
      const appId = await freshApplication('Vũ Văn Rút Lui');

      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/withdraw`)
        .set(auth(hrToken))
        .send({ note: 'Ứng viên nhận offer khác' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('WITHDRAWN');
      expect(res.body.data.currentStageId).toBe(stagesSorted[0].id);

      const history = await db.applicationStageHistory.findMany({
        where: { applicationId: appId },
      });
      expect(history).toHaveLength(1);

      const activities = await db.applicationActivity.findMany({
        where: { applicationId: appId, type: 'WITHDRAWN' },
      });
      expect(activities).toHaveLength(1);
    });

    it('blocks re-disposing a closed application with 409 APPLICATION_NOT_ACTIVE', async () => {
      const appId = await freshApplication('Hoàng Văn Đã Đóng');
      await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/withdraw`)
        .set(auth(hrToken))
        .send({});

      const res = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/reject`)
        .set(auth(hrToken))
        .send({ rejectionReason: 'OTHER' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_NOT_ACTIVE');
    });

    it('rejects disposition for a user without the permission (403)', async () => {
      const appId = await freshApplication('Bùi Thị Không Quyền');

      const reject = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/reject`)
        .set(auth(noAccessToken))
        .send({ rejectionReason: 'OTHER' });
      expect(reject.status).toBe(403);

      const hire = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/hire`)
        .set(auth(noAccessToken))
        .send({});
      expect(hire.status).toBe(403);

      const withdraw = await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/withdraw`)
        .set(auth(noAccessToken))
        .send({});
      expect(withdraw.status).toBe(403);
    });
  });

  describe('application notes + activity feed', () => {
    async function freshApplication(name: string) {
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: name, source: 'DIRECT' });
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: cand.body.data.id, jobId });
      return created.body.data.id as string;
    }

    it('adds a NOTE activity authored by the current employee', async () => {
      const appId = await freshApplication('Ngô Thị Ghi Chú');

      const res = await request(app)
        .post(`/api/v1/recruitment/applications/${appId}/notes`)
        .set(auth(hrToken))
        .send({ body: 'Ứng viên có kinh nghiệm tốt với React' });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('NOTE');
      expect(res.body.data.body).toBe('Ứng viên có kinh nghiệm tốt với React');
      // The note carries its author so the feed can attribute it to a person.
      expect(res.body.data.author).not.toBeNull();
      expect(res.body.data.author.fullName).toBe('HR Manager');
    });

    it('returns the feed newest-first with both the system APPLIED event and the note', async () => {
      const appId = await freshApplication('Lý Văn Dòng Thời Gian');
      await request(app)
        .post(`/api/v1/recruitment/applications/${appId}/notes`)
        .set(auth(hrToken))
        .send({ body: 'Ghi chú sau khi tạo hồ sơ' });

      const res = await request(app)
        .get(`/api/v1/recruitment/applications/${appId}/activities`)
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      // Newest first: the NOTE precedes the system APPLIED event.
      expect(res.body.data[0].type).toBe('NOTE');
      expect(res.body.data[1].type).toBe('APPLIED');
      // APPLIED is attributed to the recruiter who created the application.
      expect(res.body.data[1].author).not.toBeNull();
    });

    it('allows a note on a closed (withdrawn) application', async () => {
      const appId = await freshApplication('Tạ Thị Đã Đóng Vẫn Ghi');
      await request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/withdraw`)
        .set(auth(hrToken))
        .send({});

      const res = await request(app)
        .post(`/api/v1/recruitment/applications/${appId}/notes`)
        .set(auth(hrToken))
        .send({ body: 'Lưu ý cho lần tuyển sau' });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('NOTE');
    });

    it('rejects an empty note body with 422', async () => {
      const appId = await freshApplication('Mai Văn Trống');

      const res = await request(app)
        .post(`/api/v1/recruitment/applications/${appId}/notes`)
        .set(auth(hrToken))
        .send({ body: '   ' });

      expect(res.status).toBe(422);
    });

    it('rejects a note for a user without recruitment:application_note (403)', async () => {
      const appId = await freshApplication('Đinh Thị Không Quyền');

      const res = await request(app)
        .post(`/api/v1/recruitment/applications/${appId}/notes`)
        .set(auth(noAccessToken))
        .send({ body: 'Không nên ghi được' });

      expect(res.status).toBe(403);
    });
  });

  describe('fetching one application by id', () => {
    async function freshApplication(name: string) {
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: name, source: 'DIRECT' });
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: cand.body.data.id, jobId });
      return created.body.data.id as string;
    }

    it('returns the full application with candidate, job and current stage', async () => {
      const appId = await freshApplication('Phạm Thị Chi Tiết');

      const res = await request(app)
        .get(`/api/v1/recruitment/applications/${appId}`)
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(appId);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.candidate.fullName).toBe('Phạm Thị Chi Tiết');
      expect(res.body.data.job.title).toBe('Backend Developer');
      expect(res.body.data.currentStage.type).toBe('SOURCED');
    });

    it('returns 404 for an unknown application id', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/applications/c0000000000000000000000000')
        .set(auth(hrToken));

      expect(res.status).toBe(404);
    });

    it('rejects the fetch for a user without recruitment:application_view (403)', async () => {
      const appId = await freshApplication('Trịnh Văn Không Xem');

      const res = await request(app)
        .get(`/api/v1/recruitment/applications/${appId}`)
        .set(auth(noAccessToken));

      expect(res.status).toBe(403);
    });
  });

  describe('stage-transition policy — OFFER gate, terminal block, force override', () => {
    let offerStageId: string;
    let hiredStageId: string;
    let rejectedStageId: string;

    beforeAll(() => {
      offerStageId = stagesSorted.find((s) => s.type === 'OFFER')!.id;
      hiredStageId = stagesSorted.find((s) => s.type === 'HIRED')!.id;
      rejectedStageId = stagesSorted.find((s) => s.type === 'REJECTED')!.id;
    });

    async function freshApplication(name: string) {
      const cand = await request(app)
        .post('/api/v1/recruitment/candidates')
        .set(auth(hrToken))
        .send({ fullName: name, source: 'DIRECT' });
      const created = await request(app)
        .post('/api/v1/recruitment/applications')
        .set(auth(hrToken))
        .send({ candidateId: cand.body.data.id, jobId });
      return created.body.data.id as string;
    }

    // The OFFER gate reads two signals straight from the DB: a COMPLETED interview
    // and a submitted scorecard. Seed both directly — the route to create/score
    // interviews is exercised by its own suites; here they are pure preconditions.
    async function seedCompletedInterviewWithScorecard(applicationId: string) {
      const interview = await db.interview.create({
        data: {
          tenantId,
          applicationId,
          scheduledAt: new Date(Date.now() - 24 * 3600 * 1000),
          durationMin: 60,
          mode: 'VIDEO',
          status: 'COMPLETED',
          createdById: hrEmployeeId,
          interviewers: { create: [{ employeeId: hrEmployeeId }] },
        },
      });
      await db.scorecard.create({
        data: {
          interviewId: interview.id,
          interviewerId: hrEmployeeId,
          overall: 'YES',
          submittedAt: new Date(),
        },
      });
      return interview.id;
    }

    const move = (token: string, appId: string, body: Record<string, unknown>) =>
      request(app)
        .patch(`/api/v1/recruitment/applications/${appId}/move`)
        .set(auth(token))
        .send(body);

    it('blocks a move into OFFER without a completed interview + scorecard (409 APPLICATION_OFFER_GATE_UNMET)', async () => {
      const appId = await freshApplication('Cao Văn Chưa Đủ Điều Kiện');

      const res = await move(hrToken, appId, { toStageId: offerStageId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_OFFER_GATE_UNMET');
    });

    it('blocks OFFER when only the interview is completed but no scorecard is submitted (409)', async () => {
      const appId = await freshApplication('Lương Thị Thiếu Đánh Giá');
      // Completed interview, but its single scorecard is left unsubmitted.
      const interview = await db.interview.create({
        data: {
          tenantId,
          applicationId: appId,
          scheduledAt: new Date(Date.now() - 24 * 3600 * 1000),
          durationMin: 60,
          mode: 'VIDEO',
          status: 'COMPLETED',
          createdById: hrEmployeeId,
          interviewers: { create: [{ employeeId: hrEmployeeId }] },
        },
      });
      await db.scorecard.create({
        data: { interviewId: interview.id, interviewerId: hrEmployeeId, overall: 'YES', submittedAt: null },
      });

      const res = await move(hrToken, appId, { toStageId: offerStageId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_OFFER_GATE_UNMET');
    });

    it('allows a move into OFFER once an interview is COMPLETED and a scorecard is submitted (200)', async () => {
      const appId = await freshApplication('Nguyễn Thị Đủ Điều Kiện');
      await seedCompletedInterviewWithScorecard(appId);

      const res = await move(hrToken, appId, { toStageId: offerStageId, note: 'Đạt vòng phỏng vấn' });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStage.type).toBe('OFFER');
    });

    it('blocks a move directly into the terminal HIRED stage (409 APPLICATION_MOVE_TO_TERMINAL)', async () => {
      const appId = await freshApplication('Trần Văn Tuyển Sai Cách');

      const res = await move(hrToken, appId, { toStageId: hiredStageId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_MOVE_TO_TERMINAL');
    });

    it('blocks a move directly into the terminal REJECTED stage (409 APPLICATION_MOVE_TO_TERMINAL)', async () => {
      const appId = await freshApplication('Phan Thị Từ Chối Sai Cách');

      const res = await move(hrToken, appId, { toStageId: rejectedStageId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_MOVE_TO_TERMINAL');
    });

    it('lets HR_MANAGER force past the OFFER gate with a reason, recording it in stage history (200)', async () => {
      const appId = await freshApplication('Đặng Văn Ngoại Lệ');

      const res = await move(hrToken, appId, {
        toStageId: offerStageId,
        force: true,
        note: 'Ngoại lệ: ứng viên nội bộ, bỏ qua vòng đánh giá',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStage.type).toBe('OFFER');

      // The reason must persist on the move row — the audit basis for the override.
      const history = await db.applicationStageHistory.findFirst({
        where: { applicationId: appId, toStageId: offerStageId },
      });
      expect(history?.note).toBe('Ngoại lệ: ứng viên nội bộ, bỏ qua vòng đánh giá');
    });

    it('rejects a forced move with no reason (422 FORCE_MOVE_REASON_REQUIRED)', async () => {
      const appId = await freshApplication('Hồ Thị Quên Lý Do');

      const res = await move(hrToken, appId, { toStageId: offerStageId, force: true });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FORCE_MOVE_REASON_REQUIRED');
    });

    it('rejects a forced move whose reason is only whitespace (422 FORCE_MOVE_REASON_REQUIRED)', async () => {
      const appId = await freshApplication('Lý Văn Lý Do Trống');

      const res = await move(hrToken, appId, { toStageId: offerStageId, force: true, note: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FORCE_MOVE_REASON_REQUIRED');
    });

    it('ignores force=true from a role lacking application_force_move — the gate still blocks (409)', async () => {
      const appId = await freshApplication('Vũ Thị Không Đủ Quyền');

      // MANAGER holds application_move (passes the route gate) but not
      // application_force_move, so force must be silently disregarded.
      const res = await move(managerToken, appId, {
        toStageId: offerStageId,
        force: true,
        note: 'Cố gắng vượt cổng',
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_OFFER_GATE_UNMET');
    });
  });
});
