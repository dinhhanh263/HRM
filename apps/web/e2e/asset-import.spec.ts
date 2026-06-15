import { test, expect, request as playwrightRequest, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Critical-path E2E for the Asset Bulk Import wizard, run against the live
 * app + API + DB. Unlike employee import this flow is synchronous + atomic, so
 * the wizard has three steps (upload → review → done), no progress polling.
 *
 * The test seeds its own asset category via the API so the clean import has a
 * resolvable category, then drives the real UI:
 *   upload (bad category) → review shows error + confirm disabled
 *     → back → upload clean → confirm → done.
 * Finally it asserts the DB business outcome (the assets really exist with
 * status AVAILABLE) through the list API — coverage is not proof.
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };
const TENANT_SLUG = 'codecrush';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:5000/api/v1';

const HEADER = 'assetCode,name,category';

/** Unique-per-run suffix keeps imported asset codes from colliding across runs. */
function runTag(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Authenticated API context (Bearer header) for seeding + outcome assertions. */
async function apiLogin(): Promise<{ api: APIRequestContext; token: string }> {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN.email, password: ADMIN.password, tenantSlug: TENANT_SLUG },
  });
  expect(res.ok(), 'API login should succeed').toBeTruthy();
  const token = (await res.json()).data.accessToken as string;
  return { api: ctx, token };
}

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  // Auth is in-memory only — navigate client-side via the sidebar, never reload.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  await page.getByRole('link', { name: 'Tài sản', exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/assets'), { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Nhập từ Excel/i })).toBeVisible();
}

/** Set a CSV file on the wizard's hidden file input. */
async function uploadCsv(page: Page, name: string, contents: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(contents, 'utf-8'),
  });
}

test('asset import: bad category blocks confirm → clean file imports and persists', async ({
  page,
}) => {
  const tag = runTag();
  const categoryCode = `E2E-${tag}`;
  const codeA = `E2E-A-${tag}`;
  const codeB = `E2E-B-${tag}`;

  const { api, token } = await apiLogin();

  // Seed a category the clean rows can resolve to (no auto-create on import).
  const catRes = await api.post(`${API_BASE}/assets/categories`, {
    ...auth(token),
    data: { name: `E2E Import ${tag}`, code: categoryCode },
  });
  expect(catRes.ok(), 'category seed should succeed').toBeTruthy();
  const categoryId = (await catRes.json()).data.id as string;

  try {
    await login(page);

    // Open the wizard.
    await page.getByRole('button', { name: /Nhập từ Excel/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Nhập tài sản hàng loạt')).toBeVisible();

    // 1) Upload a file mixing one valid row with one unknown-category row.
    const mixed = [
      HEADER,
      `${codeA},Valid laptop,${categoryCode}`,
      `BAD-${tag},Bad category,NOPE`,
    ].join('\n');
    await uploadCsv(page, 'mixed.csv', mixed);
    await page.getByRole('button', { name: /Kiểm tra tệp/i }).click();

    // Review surfaces the localized CATEGORY_NOT_FOUND error and disables confirm.
    await expect(dialog.getByText('Không tìm thấy loại tài sản')).toBeVisible();
    await expect(page.getByRole('button', { name: /Nhập 1 tài sản/i })).toBeDisabled();

    // 2) Go back and upload a clean two-row file.
    await page.getByRole('button', { name: /Tải tệp khác/i }).click();
    const clean = [
      HEADER,
      `${codeA},Valid laptop,${categoryCode}`,
      `${codeB},Second laptop,${categoryCode}`,
    ].join('\n');
    await uploadCsv(page, 'clean.csv', clean);
    await page.getByRole('button', { name: /Kiểm tra tệp/i }).click();

    // Both rows valid → confirm enabled.
    const confirm = page.getByRole('button', { name: /Nhập 2 tài sản/i });
    await expect(confirm).toBeEnabled();

    // 3) Confirm → synchronous atomic import → done step shows the summary.
    await confirm.click();
    await expect(dialog.getByText('Hoàn tất nhập dữ liệu')).toBeVisible();
    const createdCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByText('Tài sản đã tạo', { exact: true }) });
    await expect(createdCard.getByText('2', { exact: true })).toBeVisible();

    // 4) Business outcome: the two assets really exist in the DB (via list API),
    //    both AVAILABLE (no owner column was provided).
    const list = await api.get(
      `${API_BASE}/assets?search=${tag}&limit=50`,
      auth(token),
    );
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()).data as Array<{ assetCode: string; status: string }>;
    const byCode = new Map(items.map((a) => [a.assetCode, a.status]));
    expect(byCode.get(codeA)).toBe('AVAILABLE');
    expect(byCode.get(codeB)).toBe('AVAILABLE');
  } finally {
    // Clean up everything this run created so the dev DB stays tidy.
    const list = await api.get(`${API_BASE}/assets?search=${tag}&limit=50`, auth(token));
    if (list.ok()) {
      const items = (await list.json()).data as Array<{ id: string }>;
      for (const a of items) await api.delete(`${API_BASE}/assets/${a.id}`, auth(token));
    }
    await api.delete(`${API_BASE}/assets/categories/${categoryId}`, auth(token));
    await api.dispose();
  }
});
