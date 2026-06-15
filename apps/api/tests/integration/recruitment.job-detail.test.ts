import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-jobdetail-tenant';
const HR_EMAIL = 'hr@recruitment-jobdetail.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-jobdetail.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Sàng lọc', order: 1, type: 'SCREEN' },
  { name: 'Phỏng vấn', order: 2, type: 'INTERVIEW' },
  { name: 'Đã tuyển', order: 3, type: 'HIRED' },
  { name: 'Từ chối', order: 4, type: 'REJECTED' },
];

async function cleanup(tenantId: string) {
  await db.applicationStageHistory.deleteMany({ where: { application: { tenantId } } });
  await db.application.deleteMany({ where: { tenantId } });
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.jobHiringTeam.deleteMany({ where: { job: { tenantId } } });
  await db.job.deleteMany({ where: { tenantId } });
  await db.pipelineTemplate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.department.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function createJob(token: string, templateId: string, title: string) {
  const res = await request(app)
    .post('/api/v1/recruitment/jobs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, pipelineTemplateId: templateId });
  return res.body.data;
}

describe('Recruitment API — job detail (stages + hiring team)', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let templateId: string;
  let memberEmployeeId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment JobDetail Tenant', slug: TENANT_SLUG },
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

    // A regular employee to assign onto the hiring team.
    const memberUser = await db.user.create({
      data: {
        tenantId,
        email: 'member@recruitment-jobdetail.com',
        passwordHash: await hashPassword('Member@123'),
        fullName: 'Trần Phỏng Vấn',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const member = await db.employee.create({
      data: {
        tenantId,
        userId: memberUser.id,
        employeeCode: 'EMP-100',
        fullName: 'Trần Phỏng Vấn',
        joinDate: new Date('2024-02-01'),
        contractType: 'FULL_TIME',
      },
    });
    memberEmployeeId = member.id;

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
    templateId = template.id;

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  // ===== Stage editor =====

  it('reorders, renames, and adds stages via PUT /jobs/:id/stages', async () => {
    const job = await createJob(hrToken, templateId, 'Stage Reorder Role');
    // Build a new ordering: swap SCREEN and INTERVIEW, rename SOURCED, add an OFFER stage.
    const sourced = job.stages.find((s: { type: string }) => s.type === 'SOURCED');
    const screen = job.stages.find((s: { type: string }) => s.type === 'SCREEN');
    const interview = job.stages.find((s: { type: string }) => s.type === 'INTERVIEW');
    const hired = job.stages.find((s: { type: string }) => s.type === 'HIRED');
    const rejected = job.stages.find((s: { type: string }) => s.type === 'REJECTED');

    const res = await request(app)
      .put(`/api/v1/recruitment/jobs/${job.id}/stages`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        stages: [
          { id: sourced.id, name: 'Hồ sơ mới', order: 0, type: 'SOURCED' },
          { id: interview.id, name: 'Phỏng vấn', order: 1, type: 'INTERVIEW' },
          { id: screen.id, name: 'Sàng lọc', order: 2, type: 'SCREEN' },
          { name: 'Đề nghị', order: 3, type: 'OFFER' },
          { id: hired.id, name: 'Đã tuyển', order: 4, type: 'HIRED' },
          { id: rejected.id, name: 'Từ chối', order: 5, type: 'REJECTED' },
        ],
      });

    expect(res.status).toBe(200);
    const ordered = res.body.data.stages.sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order
    );
    expect(ordered.map((s: { type: string }) => s.type)).toEqual([
      'SOURCED',
      'INTERVIEW',
      'SCREEN',
      'OFFER',
      'HIRED',
      'REJECTED',
    ]);
    expect(ordered[0].name).toBe('Hồ sơ mới');
    expect(res.body.data.stageCount).toBe(6);
  });

  it('deletes a stage that is omitted from the payload (no applications)', async () => {
    const job = await createJob(hrToken, templateId, 'Stage Delete Role');
    const keep = job.stages.filter((s: { type: string }) => s.type !== 'SCREEN');

    const res = await request(app)
      .put(`/api/v1/recruitment/jobs/${job.id}/stages`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        stages: keep.map((s: { id: string; name: string; type: string }, i: number) => ({
          id: s.id,
          name: s.name,
          order: i,
          type: s.type,
        })),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.stages.some((s: { type: string }) => s.type === 'SCREEN')).toBe(false);
    expect(res.body.data.stageCount).toBe(4);
  });

  it('blocks deleting a stage that has an application (409)', async () => {
    const job = await createJob(hrToken, templateId, 'Stage With App Role');
    const screen = job.stages.find((s: { type: string }) => s.type === 'SCREEN');

    const candidate = await db.candidate.create({
      data: { tenantId, fullName: 'Nguyễn Ứng Viên', email: 'uv@recruitment-jobdetail.com' },
    });
    await db.application.create({
      data: { tenantId, candidateId: candidate.id, jobId: job.id, currentStageId: screen.id },
    });

    // Omit the SCREEN stage (which now has an application) -> must be blocked.
    const keep = job.stages.filter((s: { type: string }) => s.type !== 'SCREEN');
    const res = await request(app)
      .put(`/api/v1/recruitment/jobs/${job.id}/stages`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        stages: keep.map((s: { id: string; name: string; type: string }, i: number) => ({
          id: s.id,
          name: s.name,
          order: i,
          type: s.type,
        })),
      });

    expect(res.status).toBe(409);
  });

  it('rejects a stage payload missing a terminal stage (422)', async () => {
    const job = await createJob(hrToken, templateId, 'Stage Missing Terminal Role');
    const noRejected = job.stages.filter((s: { type: string }) => s.type !== 'REJECTED');

    const res = await request(app)
      .put(`/api/v1/recruitment/jobs/${job.id}/stages`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        stages: noRejected.map((s: { id: string; name: string; type: string }, i: number) => ({
          id: s.id,
          name: s.name,
          order: i,
          type: s.type,
        })),
      });

    expect(res.status).toBe(422);
  });

  // ===== Hiring team =====

  it('adds, lists, updates and removes a hiring team member', async () => {
    const job = await createJob(hrToken, templateId, 'Hiring Team Role');

    const added = await request(app)
      .post(`/api/v1/recruitment/jobs/${job.id}/hiring-team`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId: memberEmployeeId, teamRole: 'INTERVIEWER' });
    expect(added.status).toBe(201);
    expect(added.body.data.teamRole).toBe('INTERVIEWER');
    expect(added.body.data.employee.fullName).toBe('Trần Phỏng Vấn');
    const memberId = added.body.data.id;

    const detail = await request(app)
      .get(`/api/v1/recruitment/jobs/${job.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(detail.body.data.hiringTeam).toHaveLength(1);
    expect(detail.body.data.hiringTeam[0].employeeId).toBe(memberEmployeeId);

    const updated = await request(app)
      .patch(`/api/v1/recruitment/jobs/${job.id}/hiring-team/${memberId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ teamRole: 'HIRING_MANAGER' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.teamRole).toBe('HIRING_MANAGER');

    const removed = await request(app)
      .delete(`/api/v1/recruitment/jobs/${job.id}/hiring-team/${memberId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(removed.status).toBe(200);

    const detailAfter = await request(app)
      .get(`/api/v1/recruitment/jobs/${job.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(detailAfter.body.data.hiringTeam).toHaveLength(0);
  });

  it('blocks adding the same employee to a job twice (409)', async () => {
    const job = await createJob(hrToken, templateId, 'Hiring Team Dup Role');
    await request(app)
      .post(`/api/v1/recruitment/jobs/${job.id}/hiring-team`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId: memberEmployeeId, teamRole: 'RECRUITER' });

    const dup = await request(app)
      .post(`/api/v1/recruitment/jobs/${job.id}/hiring-team`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId: memberEmployeeId, teamRole: 'INTERVIEWER' });
    expect(dup.status).toBe(409);
  });

  it('returns 404 when adding an unknown employee to the team', async () => {
    const job = await createJob(hrToken, templateId, 'Hiring Team Unknown Role');
    const res = await request(app)
      .post(`/api/v1/recruitment/jobs/${job.id}/hiring-team`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId: 'does-not-exist', teamRole: 'INTERVIEWER' });
    expect(res.status).toBe(404);
  });

  // ===== RBAC =====

  it('blocks stage and hiring-team edits without recruitment:job_update (403)', async () => {
    const job = await createJob(hrToken, templateId, 'RBAC Role');

    const stageRes = await request(app)
      .put(`/api/v1/recruitment/jobs/${job.id}/stages`)
      .set('Authorization', `Bearer ${noAccessToken}`)
      .send({ stages: validStages });
    expect(stageRes.status).toBe(403);

    const teamRes = await request(app)
      .post(`/api/v1/recruitment/jobs/${job.id}/hiring-team`)
      .set('Authorization', `Bearer ${noAccessToken}`)
      .send({ employeeId: memberEmployeeId, teamRole: 'INTERVIEWER' });
    expect(teamRes.status).toBe(403);
  });
});
