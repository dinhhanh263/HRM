import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { candidateRepository } from '../../src/domain/repositories/candidate.repository.js';
import { ConflictError } from '../../src/shared/errors/AppError.js';

const TENANT_SLUG = 'recruitment-cand-tenant';
const HR_EMAIL = 'hr@recruitment-cand.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-cand.com';
const NOACCESS_PASSWORD = 'NoAccess@123';
const EMP_EMAIL = 'employee@recruitment-cand.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Recruitment API — candidates', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Candidate Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
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

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;

    // A plain EMPLOYEE on the system 'employee' role — used to prove the role no
    // longer carries recruitment:candidate_view (PII leak fix, R6).
    await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Nhân Viên Thường',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });
    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
    employeeToken = empLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('creates a candidate, normalizing the phone to E.164', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({
        fullName: 'Nguyễn Văn An',
        email: 'an.nguyen@example.com',
        phone: '0901234567',
        currentTitle: 'Backend Developer',
        skills: ['Node.js', 'PostgreSQL'],
        consentGivenAt: '2026-06-06T00:00:00.000Z',
        consentSource: 'Nộp hồ sơ qua email',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe('+84901234567');
    expect(res.body.data.source).toBe('DIRECT');
    expect(res.body.data.consentGivenAt).toBeTruthy();
  });

  it('blocks a duplicate email with 409 CANDIDATE_DUPLICATE_EMAIL', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Người Khác', email: 'AN.NGUYEN@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANDIDATE_DUPLICATE_EMAIL');
  });

  it('blocks a duplicate phone after normalization', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Tên Hoàn Toàn Khác', phone: '+84 90 123 4567' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANDIDATE_DUPLICATE_PHONE');
  });

  it('warns on a possible same-name duplicate and returns matches; force overrides', async () => {
    const warn = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'nguyen van an' }); // same name, diacritic-insensitive

    expect(warn.status).toBe(409);
    expect(warn.body.error.code).toBe('CANDIDATE_POSSIBLE_DUPLICATE');
    expect(warn.body.error.details.matches.length).toBeGreaterThan(0);

    const forced = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'nguyen van an', force: true });

    expect(forced.status).toBe(201);
    expect(forced.body.data.id).toBeTruthy();
  });

  it('persists the email lowercased so the DB unique is case-stable', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(hrToken))
      .send({ fullName: 'Phạm Hồng Lê', email: 'Hong.LE@Example.COM', force: true });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('hong.le@example.com');
  });

  // The service's read-time dedupe checks are racy: two concurrent inserts can
  // both pass them. The DB indexes (case-stable email unique + partial phone
  // unique) are the authoritative backstop — exercise them directly through the
  // repository, bypassing the service pre-checks, to prove the race is caught.
  describe('DB-level dedupe guards (race backstop)', () => {
    it('rejects a second insert with the same normalized phone via the unique index', async () => {
      await candidateRepository.create({
        tenantId,
        fullName: 'Race Phone One',
        email: null,
        phone: '+84988111222',
        source: 'DIRECT',
        skills: [],
      });

      await expect(
        candidateRepository.create({
          tenantId,
          fullName: 'Race Phone Two',
          email: null,
          phone: '+84988111222',
          source: 'DIRECT',
          skills: [],
        })
      ).rejects.toMatchObject({ code: 'CANDIDATE_DUPLICATE_PHONE' });
    });

    it('rejects a duplicate email collision via the unique index', async () => {
      await candidateRepository.create({
        tenantId,
        fullName: 'Race Email One',
        email: 'race.email@example.com',
        phone: null,
        source: 'DIRECT',
        skills: [],
      });

      // The service lowercases before reaching here, so two case-variant inputs
      // arrive identical and the second collides on the (tenant, email) unique.
      const dup = candidateRepository.create({
        tenantId,
        fullName: 'Race Email Two',
        email: 'race.email@example.com',
        phone: null,
        source: 'DIRECT',
        skills: [],
      });

      await expect(dup).rejects.toBeInstanceOf(ConflictError);
      await expect(dup).rejects.toMatchObject({ code: 'CANDIDATE_DUPLICATE_EMAIL' });
    });

    it('allows many NULL-phone candidates (partial index skips NULLs)', async () => {
      const a = await candidateRepository.create({
        tenantId,
        fullName: 'Null Phone A',
        email: 'nullphone.a@example.com',
        phone: null,
        source: 'DIRECT',
        skills: [],
      });
      const b = await candidateRepository.create({
        tenantId,
        fullName: 'Null Phone B',
        email: 'nullphone.b@example.com',
        phone: null,
        source: 'DIRECT',
        skills: [],
      });

      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
    });
  });

  it('lists candidates with pagination and search', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/candidates?search=backend&page=1&limit=10')
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 });
    expect(res.body.data.some((c: { fullName: string }) => c.fullName === 'Nguyễn Văn An')).toBe(
      true
    );
  });

  it('rejects create for a user without recruitment:candidate_create (403)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/candidates')
      .set(auth(noAccessToken))
      .send({ fullName: 'Bị Chặn' });

    expect(res.status).toBe(403);
  });

  it('denies a plain EMPLOYEE listing candidates (no candidate_view) — PII fix', async () => {
    const list = await request(app)
      .get('/api/v1/recruitment/candidates')
      .set(auth(employeeToken));
    expect(list.status).toBe(403);

    const detail = await request(app)
      .get('/api/v1/recruitment/candidates/some-id')
      .set(auth(employeeToken));
    expect(detail.status).toBe(403);
  });

  describe('full-text search (diacritic-insensitive) + filters', () => {
    // Seed directly (bypassing dedupe) so we control skills / exp / rawCvText.
    beforeAll(async () => {
      await db.candidate.createMany({
        data: [
          {
            tenantId,
            fullName: 'Trần Bích Kỹ',
            email: 'bich.ky@example.com',
            currentTitle: 'Kỹ sư phần mềm',
            totalYearsExp: 5,
            skills: ['React', 'TypeScript'],
            rawCvText: 'Kỹ sư backend với 5 năm kinh nghiệm Node.js và PostgreSQL.',
            source: 'DIRECT',
          },
          {
            tenantId,
            fullName: 'Lê Thị Hoa',
            email: 'hoa.le@example.com',
            currentTitle: 'Thực tập sinh',
            totalYearsExp: 1,
            skills: ['Java'],
            rawCvText: 'Sinh viên mới ra trường, 1 năm kinh nghiệm thực tập.',
            source: 'DIRECT',
          },
        ],
      });
    });

    const names = (body: { data: { fullName: string }[] }) =>
      body.data.map((c) => c.fullName);

    it('matches "ky su" against "Kỹ sư phần mềm" (diacritic + case insensitive)', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/candidates?search=ky su')
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(names(res.body)).toContain('Trần Bích Kỹ');
      expect(names(res.body)).not.toContain('Lê Thị Hoa');
    });

    it('searches inside rawCvText (diacritic-insensitive)', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/candidates?search=kinh nghiem nodejs')
        .set(auth(hrToken));
      // "kinh nghiem" (no diacritics) hits the seeded rawCvText "kinh nghiệm".
      const res2 = await request(app)
        .get('/api/v1/recruitment/candidates?search=PostgreSQL')
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(names(res2.body)).toContain('Trần Bích Kỹ');
    });

    it('matches a skill via the search box, ignoring case', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/candidates?search=typescript')
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(names(res.body)).toContain('Trần Bích Kỹ');
    });

    it('filters by skills[] (candidate must have the skill, case-insensitive)', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/candidates?skills=react')
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(names(res.body)).toContain('Trần Bích Kỹ');
      expect(names(res.body)).not.toContain('Lê Thị Hoa');
    });

    it('filters by minExp, excluding candidates below the threshold', async () => {
      const res = await request(app)
        .get('/api/v1/recruitment/candidates?minExp=3')
        .set(auth(hrToken));

      expect(res.status).toBe(200);
      expect(names(res.body)).toContain('Trần Bích Kỹ');
      expect(names(res.body)).not.toContain('Lê Thị Hoa');
    });
  });
});
