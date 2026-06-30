import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesPipelineForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Task 3.1/3.2 — Product catalog + Quote line-items syncing Deal.amount.
const SLUG = 'sales-quote-tenant';
const ADMIN = { email: 'admin@salesquote.com', password: 'Admin@123' };

async function cleanup(tenantId: string) {
  await db.quoteItem.deleteMany({ where: { quote: { tenantId } } });
  await db.quote.deleteMany({ where: { tenantId } });
  await db.deal.deleteMany({ where: { tenantId } });
  await db.product.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.salesStage.deleteMany({ where: { pipeline: { tenantId } } });
  await db.salesPipeline.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}
async function login(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: ADMIN.password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Sales quotes (line totals + Deal.amount sync + product guard)', () => {
  let tenantId: string;
  let token: string;
  let dealId: string;
  let productId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function dealAmount(): Promise<string> {
    const d = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
    return d.amount.toString();
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Quote', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesPipelineForTenant(db, tenantId);
    const adminUser = await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    const ownerEmp = await db.employee.create({ data: { tenantId, userId: adminUser.id, employeeCode: 'ADM', fullName: 'Admin', joinDate: new Date(), contractType: 'FULL_TIME' } });
    token = await login();

    const pipeline = await db.salesPipeline.findFirstOrThrow({ where: { tenantId, isDefault: true } });
    const stage = await db.salesStage.findFirstOrThrow({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    const cust = await db.customer.create({ data: { tenantId, type: 'B2B', fullName: 'QuoteCo' } });
    const deal = await db.deal.create({ data: { tenantId, customerId: cust.id, pipelineId: pipeline.id, currentStageId: stage.id, ownerId: ownerEmp.id, title: 'Deal Q' } });
    dealId = deal.id;
    const prod = await request(app).post('/api/v1/sales/products').set(auth()).send({ name: 'Gói SaaS', sku: 'SAAS-1', unitPrice: 150000 });
    productId = prod.body.data.id;
  });

  it('creating a primary quote sets Deal.amount = quote total', async () => {
    const res = await request(app).post(`/api/v1/sales/deals/${dealId}/quotes`).set(auth()).send({
      items: [
        { productId, quantity: 2, unitPrice: 150000, discountPct: 0 }, // 300000
        { description: 'Phí triển khai', quantity: 1, unitPrice: 1000000, discountPct: 10 }, // 900000
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe('1200000');
    expect(res.body.data.items[0].lineTotal).toBe('300000');
    expect(await dealAmount()).toBe('1200000');
  });

  it('a new primary quote takes over Deal.amount and demotes the old primary', async () => {
    const res = await request(app).post(`/api/v1/sales/deals/${dealId}/quotes`).set(auth()).send({
      items: [{ quantity: 1, unitPrice: 500000, discountPct: 0 }],
      isPrimary: true,
    });
    expect(res.body.data.total).toBe('500000');
    expect(await dealAmount()).toBe('500000');
    const primaries = await db.quote.count({ where: { dealId, isPrimary: true } });
    expect(primaries).toBe(1);
  });

  it('editing the primary quote items recomputes Deal.amount', async () => {
    const primary = await db.quote.findFirstOrThrow({ where: { dealId, isPrimary: true } });
    const res = await request(app).patch(`/api/v1/sales/quotes/${primary.id}`).set(auth()).send({
      items: [{ quantity: 3, unitPrice: 200000, discountPct: 0 }], // 600000
    });
    expect(res.body.data.total).toBe('600000');
    expect(await dealAmount()).toBe('600000');
  });

  it('deleting the primary quote resets Deal.amount to the remaining (none → 0)', async () => {
    const quotes = await db.quote.findMany({ where: { dealId } });
    for (const q of quotes) {
      await request(app).delete(`/api/v1/sales/quotes/${q.id}`).set(auth());
    }
    expect(await dealAmount()).toBe('0');
  });

  it('blocks deleting a product used in a quote (PRODUCT_IN_USE)', async () => {
    await request(app).post(`/api/v1/sales/deals/${dealId}/quotes`).set(auth()).send({ items: [{ productId, quantity: 1, unitPrice: 150000 }] });
    const res = await request(app).delete(`/api/v1/sales/products/${productId}`).set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_IN_USE');
  });

  it('exports a quote PDF', async () => {
    const quote = await db.quote.findFirstOrThrow({ where: { dealId } });
    const res = await request(app).get(`/api/v1/sales/quotes/${quote.id}/pdf`).set(auth()).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length).toBeGreaterThan(500);
  });
});
