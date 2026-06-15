import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { db } from '../../src/infrastructure/database/client.js';
import { redis } from '../../src/infrastructure/cache/redis.js';
import { getCvParseQueue } from '../../src/domain/recruitment/cv-parse.queue.js';
import { createCvParseWorker } from '../../src/domain/recruitment/cv-parse.worker.js';
import { bulkImportService } from '../../src/domain/services/bulk-import.service.js';

const TENANT_SLUG = 'recruitment-bulkparse-tenant';

// Parseable by the heuristic parser (no ANTHROPIC_API_KEY in tests).
const CV_TEXT = [
  'Le Van Cuong',
  'Frontend Engineer',
  'Email: cuong.le@example.com',
  'Phone: 0901 234 567',
  'Skills: React, TypeScript, Tailwind.',
].join('\n');

function makePdf(text?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (text) doc.text(text);
    doc.end();
  });
}

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' as const },
  { name: 'Đã tuyển', order: 1, type: 'HIRED' as const },
];

async function cleanup(tenantId: string) {
  await db.bulkImportBatch.deleteMany({ where: { tenantId } });
  await db.job.deleteMany({ where: { tenantId } });
  await db.candidate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.user.deleteMany({ where: { tenantId } });
}

describe('Recruitment API — bulk CV intake (parse worker)', () => {
  let tenantId: string;
  let jobId: string;
  let userId: string;
  let worker: Worker;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Bulk Parse Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    const ownerUser = await db.user.create({
      data: {
        tenantId,
        email: 'owner@recruitment-bulkparse.com',
        passwordHash: 'x',
        fullName: 'Job Owner',
        role: 'HR_MANAGER',
        status: 'ACTIVE',
      },
    });

    const owner = await db.employee.create({
      data: {
        tenantId,
        userId: ownerUser.id,
        employeeCode: 'OWN-001',
        fullName: 'Job Owner',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });
    userId = owner.id;

    const job = await db.job.create({
      data: {
        tenantId,
        title: 'Frontend Engineer',
        status: 'OPEN',
        createdById: owner.id,
        stages: { create: validStages },
      },
    });
    jobId = job.id;

    await getCvParseQueue().obliterate({ force: true });
    worker = createCvParseWorker();
  });

  afterAll(async () => {
    await worker.close();
    await getCvParseQueue().close();
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
    await redis.quit();
  });

  async function waitForItem(itemId: string) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const item = await db.bulkImportItem.findUnique({ where: { id: itemId } });
      if (item && (item.status === 'PARSED' || item.status === 'PARSE_FAILED')) return item;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for item ${itemId}`);
  }

  it('parses a staged CV into a structured suggestion and seeds reviewedData', async () => {
    const pdf = await makePdf(CV_TEXT);
    const batch = await bulkImportService.createBatch(jobId, tenantId, userId, [
      { buffer: pdf, originalName: 'cv-cuong.pdf', mimeType: 'application/pdf' },
    ]);

    const item = await waitForItem(batch.items[0].id);

    expect(item.status).toBe('PARSED');
    expect(item.parseStatus).toBe('DONE');
    const pd = item.parsedData as { hasText: boolean; parsed: { email?: string; skills: string[] } };
    expect(pd.hasText).toBe(true);
    expect(pd.parsed.email).toBe('cuong.le@example.com');
    expect(pd.parsed.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']));
    // reviewedData is seeded with the same suggestion so HR edits from a draft.
    expect(item.reviewedData).toMatchObject({ email: 'cuong.le@example.com' });
  });

  it('falls back to a filename-derived name when a CV has no extractable text', async () => {
    const blankPdf = await makePdf(); // image-only style: no selectable text
    const batch = await bulkImportService.createBatch(jobId, tenantId, userId, [
      { buffer: blankPdf, originalName: 'Tran-Thi-Mai_CV.pdf', mimeType: 'application/pdf' },
    ]);

    const item = await waitForItem(batch.items[0].id);

    expect(item.status).toBe('PARSED');
    const pd = item.parsedData as { hasText: boolean; parsed: { fullName?: string } };
    expect(pd.hasText).toBe(false);
    expect(item.parserProvider).toBe('filename-fallback');
    expect(pd.parsed.fullName).toBe('Tran Thi Mai');
  });

  it('flags a parsed CV as LINK_EXISTING when its email matches a known candidate', async () => {
    const existing = await db.candidate.create({
      data: { tenantId, fullName: 'Lê Văn Cường', email: 'cuong.le@example.com' },
    });

    const pdf = await makePdf(CV_TEXT);
    const batch = await bulkImportService.createBatch(jobId, tenantId, userId, [
      { buffer: pdf, originalName: 'cv-dup.pdf', mimeType: 'application/pdf' },
    ]);

    const item = await waitForItem(batch.items[0].id);

    expect(item.status).toBe('PARSED');
    expect(item.resolution).toBe('LINK_EXISTING');
    expect(item.duplicateOfCandidateId).toBe(existing.id);
    expect(item.duplicateReason).toBe('EMAIL');
  });
});
