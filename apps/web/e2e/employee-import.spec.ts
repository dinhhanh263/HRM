import { test, expect, type Page } from '@playwright/test';

/**
 * Full happy-path E2E for the Employee Bulk Import wizard, run against the live
 * app + API + DB + BullMQ worker. Covers: upload → validate (deliberate errors)
 * → fix → confirm → progress → done. Emails are unique per run so re-runs create
 * fresh employees instead of hitting the idempotent skip path.
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };

const HEADER = 'fullName,email,department,position';

/** Unique-per-run suffix keeps imported emails from colliding across runs. */
function runTag(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** A CSV with one valid row and one invalid-email row. */
function csvWithErrors(tag: string): string {
  return [
    HEADER,
    `Nguyen Van A,valid.a.${tag}@example.com,Engineering,Developer`,
    `Tran Thi B,not-an-email,Engineering,Developer`,
  ].join('\n');
}

/** A clean CSV with two valid rows. */
function cleanCsv(tag: string): string {
  return [
    HEADER,
    `Le Van C,valid.c.${tag}@example.com,Engineering,Developer`,
    `Pham Thi D,valid.d.${tag}@example.com,Engineering,Tester`,
  ].join('\n');
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  // Auth state is in-memory only, so navigate client-side via the sidebar link
  // (a full page reload would drop the access token and bounce back to /login).
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  await page.getByRole('link', { name: 'Nhân viên' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/employees'), { timeout: 20_000 });
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

test('import wizard: upload → validate (errors) → fix → confirm → progress → done', async ({
  page,
}) => {
  const tag = runTag();
  await login(page);

  // Open the wizard.
  await page.getByRole('button', { name: /Nhập từ Excel/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Nhập nhân viên hàng loạt')).toBeVisible();

  // 1) Upload a file with a deliberate bad-email row and validate.
  await uploadCsv(page, 'with-errors.csv', csvWithErrors(tag));
  await page.getByRole('button', { name: /Kiểm tra tệp/i }).click();

  // Review shows 1 valid, 1 error, and the localized error label in the table.
  await expect(page.getByText('Email không hợp lệ')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Nhập 1 nhân viên/i }),
  ).toBeVisible();

  // 2) Go back and fix by uploading a clean file.
  await page.getByRole('button', { name: /Tải tệp khác/i }).click();
  await uploadCsv(page, 'clean.csv', cleanCsv(tag));
  await page.getByRole('button', { name: /Kiểm tra tệp/i }).click();

  // Now two valid rows, no errors.
  await expect(page.getByText('Tất cả các dòng đều hợp lệ.')).toBeVisible();
  const confirm = page.getByRole('button', { name: /Nhập 2 nhân viên/i });
  await expect(confirm).toBeEnabled();

  // 3) Confirm → progress.
  await confirm.click();
  await expect(page.getByText('Đang nhập dữ liệu')).toBeVisible();

  // 4) Worker finishes → done step shows the success summary.
  await expect(page.getByText('Hoàn tất nhập dữ liệu')).toBeVisible({ timeout: 30_000 });
  // "Đã tạo" (created) stat card should read 2.
  const createdCard = page
    .locator('div.rounded-lg')
    .filter({ has: page.getByText('Đã tạo', { exact: true }) });
  await expect(createdCard.getByText('2', { exact: true })).toBeVisible();
});
