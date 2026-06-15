import { test, expect, type Page } from '@playwright/test';

/**
 * SPEC-032 — Probation Guidelines critical path through the real UI.
 *
 * Business outcome under test: HR publishes a year-scoped evaluation guideline
 * and a viewer of the Probation page actually READS it — title and multi-line
 * content render under the right year; an edit replaces what readers see; a
 * delete removes it. Admin holds probation:view + probation:configure so one
 * actor drives the whole flow (role split is covered by API integration tests).
 *
 * Year 2099 keeps this run's data away from real guidelines (dev tenant writes
 * 2026); the test deletes what it creates.
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };
const GUIDELINE_YEAR = '2099';

function runTag(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

// Dọn dữ liệu năm 2099 qua API kể cả khi test fail giữa chừng — không để bài
// test mồ côi tích tụ trong tenant dev.
test.afterEach(async ({ request }) => {
  const login = await request.post('/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password, tenantSlug: 'codecrush' },
  });
  if (!login.ok()) return;
  const token = (await login.json()).data.accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  const list = await request.get(`/api/v1/probation/guidelines?year=${GUIDELINE_YEAR}`, {
    headers,
  });
  if (!list.ok()) return;
  for (const g of (await list.json()).data as Array<{ id: string }>) {
    await request.delete(`/api/v1/probation/guidelines/${g.id}`, { headers });
  }
});

test('probation guidelines: HR publishes a year guideline → reader sees it → edit replaces it → delete removes it', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const tag = runTag();
  const title = `Hướng dẫn ${tag}`;
  const editedTitle = `Hướng dẫn ${tag} (sửa)`;
  const contentLine1 = `Bước 1 của ${tag}: mở popover rubric.`;
  const contentLine2 = `Bước 2 của ${tag}: ghi bằng chứng kèm link.`;

  await login(page);

  // 1) Open the Guidelines tab. (Năm 2099 chưa có option trong select — sau khi
  //    tạo bài, UI tự chuyển sang năm của bài mới.)
  await page.goto('/probation');
  await page.getByRole('button', { name: 'Hướng dẫn' }).click();

  // 2) HR creates a guideline for the test year via the Sheet form.
  await page.getByRole('button', { name: 'Thêm hướng dẫn' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.locator('#pg-title').fill(title);
  await sheet.locator('#pg-year').fill(GUIDELINE_YEAR);
  await sheet.locator('#pg-content').fill(`${contentLine1}\n${contentLine2}`);
  await sheet.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // 3) The reader-facing outcome: the card shows the title AND the multi-line
  //    content (both lines visible — line breaks preserved) under year 2099.
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(contentLine1)).toBeVisible();
  await expect(page.getByText(contentLine2)).toBeVisible();

  // 4) Edit replaces what readers see.
  await page.getByRole('button', { name: 'Chỉnh sửa' }).first().click();
  const editSheet = page.getByRole('dialog');
  await editSheet.locator('#pg-title').fill(editedTitle);
  await editSheet.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(editSheet).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(editedTitle)).toBeVisible({ timeout: 15_000 });

  // 5) Delete removes it for readers (confirm dialog → card gone).
  await page.getByRole('button', { name: 'Xóa' }).first().click();
  const confirmDialog = page.getByRole('dialog', { name: 'Xóa hướng dẫn này?' });
  await confirmDialog.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText(editedTitle)).toBeHidden({ timeout: 15_000 });
});
