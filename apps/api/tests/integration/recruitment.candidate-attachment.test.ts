import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import PDFDocument from 'pdfkit';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { getCvParseQueue } from '../../src/domain/recruitment/cv-parse.queue.js';

const TENANT_SLUG = 'recruitment-cv-tenant';
const HR_EMAIL = 'hr@recruitment-cv.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-cv.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

// A unique sentinel so we can assert the extracted text round-trips into rawCvText.
const CV_TEXT = 'NGUYEN VAN TUYEN — Senior Backend Engineer. Skills: Node.js, PostgreSQL, Redis.';

function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
}

// supertest parses bodies as text by default; for the binary download we need
// the raw bytes back to assert the stream returns exactly what was uploaded.
function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => cb(err, Buffer.alloc(0)));
}

async function cleanup(tenantId: string) {
  await db.candidateAttachment.deleteMany({ where: { candidate: { tenantId } } });
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Recruitment API — candidate CV attachments', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let candidateId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment CV Tenant', slug: TENANT_SLUG },
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

    const candidate = await db.candidate.create({
      data: { tenantId, fullName: 'Nguyễn Văn Tuyển', source: 'DIRECT' },
    });
    candidateId = candidate.id;
  });

  afterAll(async () => {
    // Uploads enqueue a CV-parse job; close the lazily-opened queue + Redis so
    // the test process exits cleanly. No worker runs here, so jobs stay queued.
    await getCvParseQueue().close();
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await redis.quit();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('uploads a PDF CV, extracts text, and mirrors it into the candidate rawCvText', async () => {
    const pdf = await makePdf(CV_TEXT);

    const res = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken))
      .attach('file', pdf, 'cv-tuyen.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kind).toBe('CV');
    expect(res.body.data.fileName).toBe('cv-tuyen.pdf');
    expect(res.body.data.parseStatus).toBe('PENDING');
    expect(res.body.data.hasText).toBe(true);

    const candidate = await db.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate?.rawCvText).toBeTruthy();
    // Whitespace is normalized, so match on a distinctive token from the CV.
    expect(candidate?.rawCvText).toContain('Node.js');
  });

  it('keeps each upload as a separate version, newest first', async () => {
    const pdf = await makePdf('Second revision of the CV — updated skills.');

    const upload = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken))
      .attach('file', pdf, 'cv-tuyen-v2.pdf');
    expect(upload.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken));

    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);
    // Newest first (orderBy createdAt desc).
    expect(list.body.data[0].fileName).toBe('cv-tuyen-v2.pdf');
    expect(list.body.data[1].fileName).toBe('cv-tuyen.pdf');
  });

  it('downloads a stored attachment through the authenticated endpoint', async () => {
    const list = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken));
    const attachmentId = list.body.data[0].id;

    const res = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/attachments/${attachmentId}/download`)
      .set(auth(hrToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('cv-tuyen-v2.pdf');
  });

  it('streams back the exact uploaded bytes with the pdf content type', async () => {
    const original = await makePdf('Round-trip byte-equality check — distinct content.');

    const upload = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken))
      .attach('file', original, 'cv-roundtrip.pdf');
    expect(upload.status).toBe(201);
    const attachmentId = upload.body.data.id;

    const res = await request(app)
      .get(`/api/v1/recruitment/candidates/${candidateId}/attachments/${attachmentId}/download`)
      .set(auth(hrToken))
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    // The streamed body must be byte-identical to what was stored.
    expect(Buffer.compare(res.body, original)).toBe(0);
  });

  it('rejects an unsupported file type with 400 CV_UNSUPPORTED_TYPE', async () => {
    const res = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken))
      .attach('file', Buffer.from('plain text resume'), {
        filename: 'cv.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CV_UNSUPPORTED_TYPE');
  });

  it('rejects a request with no file (400 CV_NO_FILE)', async () => {
    const res = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(hrToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CV_NO_FILE');
  });

  it('rejects upload for a user without recruitment:candidate_update (403)', async () => {
    const pdf = await makePdf('Should not be accepted.');
    const res = await request(app)
      .post(`/api/v1/recruitment/candidates/${candidateId}/attachments`)
      .set(auth(noAccessToken))
      .attach('file', pdf, 'blocked.pdf');

    expect(res.status).toBe(403);
  });
});
