import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-interview-tenant';
const HR_EMAIL = 'hr@recruitment-interview.com';
const HR_PASSWORD = 'HrTest@123';
const INTERVIEWER_EMAIL = 'interviewer@recruitment-interview.com';
const INTERVIEWER_PASSWORD = 'Interviewer@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-interview.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Phỏng vấn', order: 1, type: 'INTERVIEW' },
  { name: 'Đã tuyển', order: 2, type: 'HIRED' },
  { name: 'Từ chối', order: 3, type: 'REJECTED' },
];

async function cleanup(tenantId: string) {
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

// A point comfortably in the future so the interview lands in "upcoming".
const futureIso = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

describe('Recruitment API — interviews', () => {
  let tenantId: string;
  let hrToken: string;
  let interviewerToken: string;
  let noAccessToken: string;
  let interviewerEmployeeId: string;
  let jobId: string;
  let candidateId: string;
  let applicationId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Interview Tenant', slug: TENANT_SLUG },
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

    // An EMPLOYEE-role user who will be assigned as interviewer. EMPLOYEE holds
    // scorecard_submit, so they can read their own "mine" interview list.
    const interviewerUser = await db.user.create({
      data: {
        tenantId,
        email: INTERVIEWER_EMAIL,
        passwordHash: await hashPassword(INTERVIEWER_PASSWORD),
        fullName: 'Người Phỏng Vấn',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });
    const interviewerEmployee = await db.employee.create({
      data: {
        tenantId,
        userId: interviewerUser.id,
        employeeCode: 'EMP-002',
        fullName: 'Người Phỏng Vấn',
        joinDate: new Date('2024-02-01'),
        contractType: 'FULL_TIME',
      },
    });
    interviewerEmployeeId = interviewerEmployee.id;

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

    const interviewerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: INTERVIEWER_EMAIL, password: INTERVIEWER_PASSWORD, tenantSlug: TENANT_SLUG });
    interviewerToken = interviewerLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;

    const job = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set(auth(hrToken))
      .send({ title: 'Frontend Developer', pipelineTemplateId: template.id, status: 'OPEN' });
    jobId = job.body.data.id;

    const candidate = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Trần Văn Ứng', email: 'ung.tran@example.com', source: 'REFERRAL' });
    candidateId = candidate.body.data.id;

    const application = await request(app)
      .post('/api/v1/recruitment/applications')
      .set(auth(hrToken))
      .send({ candidateId, jobId });
    applicationId = application.body.data.id;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('schedules an interview, assigns interviewers and logs INTERVIEW_SCHEDULED', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(hrToken))
      .send({
        applicationId,
        scheduledAt: futureIso,
        durationMin: 45,
        mode: 'VIDEO',
        meetingUrl: 'https://meet.example.com/abc',
        interviewerIds: [interviewerEmployeeId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SCHEDULED');
    expect(res.body.data.mode).toBe('VIDEO');
    expect(res.body.data.durationMin).toBe(45);
    expect(res.body.data.interviewers).toHaveLength(1);
    expect(res.body.data.interviewers[0].employeeId).toBe(interviewerEmployeeId);

    // The schedule action is recorded on the application's activity feed.
    const activities = await db.applicationActivity.findMany({
      where: { applicationId, type: 'INTERVIEW_SCHEDULED' },
    });
    expect(activities).toHaveLength(1);
  });

  it('rejects an interviewer id that is not an employee of the tenant (422)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(hrToken))
      .send({
        applicationId,
        scheduledAt: futureIso,
        interviewerIds: ['not-a-real-employee'],
      });

    expect(res.status).toBe(422);
  });

  it('requires at least one interviewer (422)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(hrToken))
      .send({ applicationId, scheduledAt: futureIso, interviewerIds: [] });

    expect(res.status).toBe(422);
  });

  it('lists interviews for an application', async () => {
    const res = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/interviews`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].interviewers[0].fullName).toBe('Người Phỏng Vấn');
  });

  it('shows the assigned interview in the interviewer\'s "mine" upcoming list with candidate + job', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/interviews/mine')
      .set(auth(interviewerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.upcoming).toHaveLength(1);
    expect(res.body.data.upcoming[0].candidate.fullName).toBe('Trần Văn Ứng');
    expect(res.body.data.upcoming[0].job.title).toBe('Frontend Developer');
    expect(res.body.data.upcoming[0].myScorecardSubmitted).toBe(false);
  });

  it('does not surface the interview to an employee who is not assigned', async () => {
    // HR scheduled it but is not an interviewer → both groups empty.
    const res = await request(app)
      .get('/api/v1/recruitment/interviews/mine')
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.data.upcoming).toHaveLength(0);
    expect(res.body.data.toReview).toHaveLength(0);
  });

  it('transitions a SCHEDULED interview to COMPLETED', async () => {
    const list = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/interviews`)
      .set(auth(hrToken));
    const interviewId = list.body.data[0].id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/applications/${applicationId}/interviews/${interviewId}/status`)
      .set(auth(hrToken))
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('blocks re-transition of a terminal interview with 409 INTERVIEW_NOT_SCHEDULED', async () => {
    const list = await request(app)
      .get(`/api/v1/recruitment/applications/${applicationId}/interviews`)
      .set(auth(hrToken));
    const interviewId = list.body.data[0].id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/applications/${applicationId}/interviews/${interviewId}/status`)
      .set(auth(hrToken))
      .send({ status: 'NO_SHOW' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INTERVIEW_NOT_SCHEDULED');
  });

  it('denies scheduling to a user without interview_schedule (403)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/interviews')
      .set(auth(noAccessToken))
      .send({ applicationId, scheduledAt: futureIso, interviewerIds: [interviewerEmployeeId] });

    expect(res.status).toBe(403);
  });

  // The whole point of "PV của tôi": after an interview has passed, the interviewer
  // must find it under "Chờ đánh giá" and enter their scorecard from there — and once
  // submitted it stays visible, flagged as scored so they can revise.
  describe('interviews/mine — toReview + scorecard entry', () => {
    let pastInterviewId: string;

    beforeAll(async () => {
      const past = await db.interview.create({
        data: {
          tenantId,
          applicationId,
          scheduledAt: new Date(Date.now() - 2 * 3600 * 1000),
          durationMin: 60,
          mode: 'ONSITE',
          status: 'SCHEDULED',
          createdById: interviewerEmployeeId,
          interviewers: { create: { employeeId: interviewerEmployeeId } },
        },
      });
      pastInterviewId = past.id;
    });

    it('surfaces a past interview under toReview, not scored yet', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/interviews/mine')
        .set(auth(interviewerToken));

      expect(res.status).toBe(200);
      const row = res.body.data.toReview.find((r: { id: string }) => r.id === pastInterviewId);
      expect(row).toBeDefined();
      expect(row.myScorecardSubmitted).toBe(false);
      // A past interview must not leak into the upcoming group.
      expect(res.body.data.upcoming.some((r: { id: string }) => r.id === pastInterviewId)).toBe(
        false
      );
    });

    it('flips myScorecardSubmitted to true after the interviewer submits a scorecard', async () => {
      const submit = await request(app)
        .put(`/api/v1/recruitment/interviews/${pastInterviewId}/scorecard`)
        .set(auth(interviewerToken))
        .send({ overall: 'YES', notes: 'Strong fundamentals.' });
      expect(submit.status).toBe(200);

      // Business outcome: the scorecard is persisted for this interviewer + interview.
      const stored = await db.scorecard.findFirst({
        where: { interviewId: pastInterviewId, interviewerId: interviewerEmployeeId },
      });
      expect(stored).not.toBeNull();
      expect(stored?.overall).toBe('YES');

      // And the interviewer's own list now marks it scored (still under toReview).
      const res = await request(app)
        .get('/api/v1/recruitment/interviews/mine')
        .set(auth(interviewerToken));
      const row = res.body.data.toReview.find((r: { id: string }) => r.id === pastInterviewId);
      expect(row).toBeDefined();
      expect(row.myScorecardSubmitted).toBe(true);
    });
  });
});
