import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-scorecard-tenant';
const HR_EMAIL = 'hr@recruitment-scorecard.com';
const HR_PASSWORD = 'HrTest@123';
const PV1_EMAIL = 'pv1@recruitment-scorecard.com';
const PV1_PASSWORD = 'Pv1Test@123';
const PV2_EMAIL = 'pv2@recruitment-scorecard.com';
const PV2_PASSWORD = 'Pv2Test@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-scorecard.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Phỏng vấn', order: 1, type: 'INTERVIEW' },
  { name: 'Đã tuyển', order: 2, type: 'HIRED' },
  { name: 'Từ chối', order: 3, type: 'REJECTED' },
];

async function cleanup(tenantId: string) {
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
const futureIso = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

async function makeEmployeeUser(
  tenantId: string,
  roleId: string | undefined,
  email: string,
  password: string,
  fullName: string,
  code: string
) {
  const user = await db.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await hashPassword(password),
      fullName,
      role: 'EMPLOYEE',
      roleId,
      status: 'ACTIVE',
    },
  });
  const employee = await db.employee.create({
    data: {
      tenantId,
      userId: user.id,
      employeeCode: code,
      fullName,
      joinDate: new Date('2024-01-01'),
      contractType: 'FULL_TIME',
    },
  });
  return { user, employee };
}

describe('Recruitment API — scorecards', () => {
  let tenantId: string;
  let hrToken: string;
  let pv1Token: string;
  let pv2Token: string;
  let noAccessToken: string;
  let pv1EmployeeId: string;
  let pv2EmployeeId: string;
  let mgrToken: string;
  let mgrEmployeeId: string;
  let applicationId: string;
  let interviewId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Scorecard Tenant', slug: TENANT_SLUG },
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
    await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'HR-001',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });

    // Two EMPLOYEE interviewers — they hold scorecard_submit but are scored
    // independently; no-peek must hold between them.
    const pv1 = await makeEmployeeUser(
      tenantId,
      roleIdByKey.get('employee'),
      PV1_EMAIL,
      PV1_PASSWORD,
      'Phỏng Vấn Một',
      'EMP-101'
    );
    pv1EmployeeId = pv1.employee.id;
    const pv2 = await makeEmployeeUser(
      tenantId,
      roleIdByKey.get('employee'),
      PV2_EMAIL,
      PV2_PASSWORD,
      'Phỏng Vấn Hai',
      'EMP-102'
    );
    pv2EmployeeId = pv2.employee.id;

    // A MANAGER holds application_view AND scorecard_submit, so when assigned as
    // an interviewer they can reach the summary endpoint — the surface where
    // no-peek must still hide peers until they submit.
    const mgr = await makeEmployeeUser(
      tenantId,
      roleIdByKey.get('manager'),
      'mgr@recruitment-scorecard.com',
      'MgrTest@123',
      'Quản Lý PV',
      'EMP-103'
    );
    mgrEmployeeId = mgr.employee.id;

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

    const login = async (email: string, password: string) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password, tenantSlug: TENANT_SLUG });
      return res.body.data.accessToken as string;
    };
    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    pv1Token = await login(PV1_EMAIL, PV1_PASSWORD);
    pv2Token = await login(PV2_EMAIL, PV2_PASSWORD);
    mgrToken = await login('mgr@recruitment-scorecard.com', 'MgrTest@123');
    noAccessToken = await login(NOACCESS_EMAIL, NOACCESS_PASSWORD);

    const job = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set(auth(hrToken))
      .send({ title: 'Frontend Developer', pipelineTemplateId: template.id, status: 'OPEN' });
    const jobId = job.body.data.id;

    const candidate = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Trần Văn Ứng', email: 'ung.tran@example.com', source: 'REFERRAL' });
    const candidateId = candidate.body.data.id;

    const application = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(hrToken))
      .send({ candidateId, jobId });
    applicationId = application.body.data.id;

    const interview = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(hrToken))
      .send({
        applicationId,
        scheduledAt: futureIso,
        mode: 'VIDEO',
        meetingUrl: 'https://meet.example.com/sc',
        interviewerIds: [pv1EmployeeId, pv2EmployeeId],
      });
    interviewId = interview.body.data.id;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('lets an assigned interviewer submit their own scorecard', async () => {
    const res = await request(app)
      .put(`/api/v1/recruitment/interviews/${interviewId}/scorecard`)
      .set(auth(pv1Token))
      .send({ overall: 'YES', ratings: { TECHNICAL: 3, COMMUNICATION: 4 }, notes: 'Khá tốt' });

    expect(res.status).toBe(200);
    expect(res.body.data.isMine).toBe(true);
    expect(res.body.data.overall).toBe('YES');
    expect(res.body.data.submittedAt).not.toBeNull();
  });

  it('forbids submission from someone who is not an assigned interviewer (403)', async () => {
    // HR holds scorecard_submit (passes the route gate) but is not on the panel,
    // so the service must reject the submission.
    const res = await request(app)
      .put(`/api/v1/recruitment/interviews/${interviewId}/scorecard`)
      .set(auth(hrToken))
      .send({ overall: 'STRONG_NO' });

    expect(res.status).toBe(403);
  });

  it('denies submission to a user without scorecard_submit (403)', async () => {
    const res = await request(app)
      .put(`/api/v1/recruitment/interviews/${interviewId}/scorecard`)
      .set(auth(noAccessToken))
      .send({ overall: 'YES' });

    expect(res.status).toBe(403);
  });

  it('hides peers from an interviewer who has not submitted yet (no-peek)', async () => {
    // pv2 has not submitted; pv1 already has. pv2 must not see pv1's scorecard.
    const res = await request(app)
      .get(`/api/v1/recruitment/interviews/${interviewId}/scorecards`)
      .set(auth(pv2Token));

    expect(res.status).toBe(200);
    expect(res.body.data.mine).toBeNull();
    expect(res.body.data.canViewOthers).toBe(false);
    expect(res.body.data.others).toHaveLength(0);
    expect(res.body.data.submittedCount).toBe(1);
    expect(res.body.data.totalInterviewers).toBe(2);
  });

  it('reveals peers once the interviewer submits their own scorecard', async () => {
    await request(app)
      .put(`/api/v1/recruitment/interviews/${interviewId}/scorecard`)
      .set(auth(pv2Token))
      .send({ overall: 'STRONG_YES', notes: 'Xuất sắc' });

    const res = await request(app)
      .get(`/api/v1/recruitment/interviews/${interviewId}/scorecards`)
      .set(auth(pv2Token));

    expect(res.status).toBe(200);
    expect(res.body.data.mine.isMine).toBe(true);
    expect(res.body.data.canViewOthers).toBe(true);
    expect(res.body.data.others).toHaveLength(1);
    expect(res.body.data.others[0].interviewer.employeeId).toBe(pv1EmployeeId);
  });

  it('lets a non-interviewer with application_view read all submitted scorecards', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/interviews/${interviewId}/scorecards`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.mine).toBeNull();
    expect(res.body.data.canViewOthers).toBe(true);
    expect(res.body.data.others).toHaveLength(2);
  });

  it('aggregates the average recommendation on the application scorecard summary', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const row = res.body.data[0];
    expect(row.interviewId).toBe(interviewId);
    expect(row.submittedCount).toBe(2);
    expect(row.totalInterviewers).toBe(2);
    // YES(3) + STRONG_YES(4) → 3.5
    expect(row.averageScore).toBe(3.5);
    expect(row.recommendations).toHaveLength(2);
  });

  it('overwrites the previous scorecard when an interviewer re-submits', async () => {
    const res = await request(app)
      .put(`/api/v1/recruitment/interviews/${interviewId}/scorecard`)
      .set(auth(pv1Token))
      .send({ overall: 'NO', notes: 'Đổi ý' });
    expect(res.status).toBe(200);
    expect(res.body.data.overall).toBe('NO');

    const count = await db.scorecard.count({ where: { interviewId, interviewerId: pv1EmployeeId } });
    expect(count).toBe(1);
  });

  it('denies the scorecard summary to a user without application_view (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(noAccessToken));

    expect(res.status).toBe(403);
  });

  it('redacts peer verdicts on the summary for an interviewer who has not submitted (no-peek)', async () => {
    // A second interview with the manager + pv1. pv1 submits; the manager (an
    // interviewer who holds application_view) does NOT. The manager must not see
    // pv1's verdict or the average via the summary endpoint until they submit.
    const interview2 = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(hrToken))
      .send({
        applicationId,
        scheduledAt: futureIso,
        mode: 'VIDEO',
        meetingUrl: 'https://meet.example.com/sc2',
        interviewerIds: [mgrEmployeeId, pv1EmployeeId],
      });
    const interview2Id = interview2.body.data.id as string;

    await request(app)
      .put(`/api/v1/recruitment/interviews/${interview2Id}/scorecard`)
      .set(auth(pv1Token))
      .send({ overall: 'YES', notes: 'Ổn' });

    // Manager view: their own interview row is redacted.
    const mgrRes = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(mgrToken));
    expect(mgrRes.status).toBe(200);
    const mgrRow = mgrRes.body.data.find((r: { interviewId: string }) => r.interviewId === interview2Id);
    expect(mgrRow.redacted).toBe(true);
    expect(mgrRow.averageScore).toBeNull();
    expect(mgrRow.recommendations).toHaveLength(0);
    // Progress counters stay visible.
    expect(mgrRow.submittedCount).toBe(1);
    expect(mgrRow.totalInterviewers).toBe(2);

    // HR (not an interviewer) sees the same row in full.
    const hrRes = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(hrToken));
    const hrRow = hrRes.body.data.find((r: { interviewId: string }) => r.interviewId === interview2Id);
    expect(hrRow.redacted).toBe(false);
    expect(hrRow.averageScore).not.toBeNull();
    expect(hrRow.recommendations).toHaveLength(1);
  });

  it('reveals peers on the summary once the interviewer submits their own (no-peek lifts)', async () => {
    // The manager's interview from the previous test, now with the manager's own
    // scorecard submitted — the row must un-redact.
    const before = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(mgrToken));
    const row = before.body.data.find((r: { redacted: boolean }) => r.redacted === true);
    expect(row).toBeDefined();
    const interview2Id = row.interviewId as string;

    await request(app)
      .put(`/api/v1/recruitment/interviews/${interview2Id}/scorecard`)
      .set(auth(mgrToken))
      .send({ overall: 'STRONG_YES', notes: 'Tốt' });

    const after = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/scorecard-summary`)
      .set(auth(mgrToken));
    const afterRow = after.body.data.find((r: { interviewId: string }) => r.interviewId === interview2Id);
    expect(afterRow.redacted).toBe(false);
    expect(afterRow.averageScore).not.toBeNull();
    expect(afterRow.recommendations).toHaveLength(2);
  });
});
