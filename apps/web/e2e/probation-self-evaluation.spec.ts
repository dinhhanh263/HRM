import { test, expect, type Page } from '@playwright/test';

/**
 * SPEC-033 — Self Evaluation critical path qua 3 actor thật (NV → manager/HR → HR):
 * outcome nghiệp vụ là chuỗi: NV tự chấm + nộp (khóa) → người chấm THẤY điểm tự chấm
 * (badge + tự nhận xét) ngay trong scorecard → submit → HR quyết định CONFIRM →
 * step indicator hoàn tất. Admin giữ vai trò manager+HR (RBAC scope đã được test
 * server-side); giá trị test này là luồng 3 bước end-to-end và tính khóa/hiển thị self.
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };
const EMPLOYEE_PASSWORD = 'SelfE2e@123';

function runTag(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

async function logout(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
}

test('probation self-evaluation: employee submits self → reviewer sees self scores → submits → HR confirms → all steps done', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const tag = runTag();
  const fullName = `Tự ĐG ${tag}`;
  const email = `self.${tag}@example.com`;
  const selfComment = `Khó khăn lớn nhất là quy trình release ${tag}`;

  // 1) Admin tạo NV thử việc + mở kỳ đánh giá.
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/employees/new');
  await page.getByPlaceholder('email@company.com').fill(email);
  await page.locator('input[type="password"]').fill(EMPLOYEE_PASSWORD);
  await page.getByPlaceholder('Nguyễn Văn A').fill(fullName);
  await page.getByRole('combobox').filter({ hasText: 'Toàn thời gian' }).click();
  await page.getByRole('option', { name: 'Thử việc' }).click();
  await page.getByRole('button', { name: 'Tạo nhân viên' }).click();
  await page.waitForURL((url) => url.pathname === '/employees', { timeout: 20_000 });

  await page.goto('/probation');
  await page.getByRole('button', { name: 'Tạo đánh giá' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(fullName) }).click();
  await createDialog.getByRole('button', { name: 'Tạo', exact: true }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });
  await logout(page);

  // 2) NV đăng nhập: nav "Tự đánh giá" hiện (contractType=PROBATION), chấm đủ + nộp.
  await login(page, email, EMPLOYEE_PASSWORD);
  const selfNav = page.getByRole('link', { name: 'Tự đánh giá' });
  await expect(selfNav).toBeVisible({ timeout: 15_000 });
  await selfNav.click();
  await page.waitForURL((url) => url.pathname === '/probation/me', { timeout: 15_000 });

  const groups = page.locator('[role="radiogroup"]');
  await expect(groups.first()).toBeVisible({ timeout: 15_000 });
  const groupCount = await groups.count();
  expect(groupCount).toBeGreaterThan(0);
  for (let i = 0; i < groupCount; i++) {
    await groups.nth(i).getByRole('radio', { name: '4' }).click();
  }
  await page.locator('#self-comment').fill(selfComment);
  await page.getByRole('button', { name: 'Nộp tự đánh giá' }).click();
  await page.getByRole('button', { name: 'Nộp', exact: true }).click();

  // Sau nộp: form khóa + thông báo đã nộp (bất biến — outcome người dùng thấy).
  await expect(page.getByText('Bạn đã nộp tự đánh giá', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.locator('[role="radiogroup"]').first().getByRole('radio', { name: '4' })
  ).toBeDisabled();
  await logout(page);

  // 3) Người chấm mở scorecard: THẤY điểm tự chấm + tự nhận xét, rồi chấm + nộp.
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/probation');
  const row = page.getByRole('row').filter({ hasText: fullName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 15_000 });

  // Outcome cốt lõi của SPEC-033: dữ liệu self hiển thị cho người chấm.
  await expect(sheet.getByText('NV: 4').first()).toBeVisible();
  await expect(sheet.getByText('Nhân viên tự nhận xét')).toBeVisible();
  await expect(sheet.getByText(selfComment)).toBeVisible();

  const reviewerGroups = sheet.locator('[role="radiogroup"]');
  const rgCount = await reviewerGroups.count();
  for (let i = 0; i < rgCount; i++) {
    await reviewerGroups.nth(i).getByRole('radio', { name: '5' }).click();
  }
  await sheet.getByRole('combobox').filter({ hasText: 'Chọn kết quả đề xuất' }).click();
  await page.getByRole('option', { name: 'Đạt — ký chính thức' }).click();
  await sheet.getByRole('button', { name: 'Nộp' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // 4) HR quyết định: vẫn thấy đối chiếu self ở bước duyệt, CONFIRM → hoàn tất.
  const pendingRow = page.getByRole('row').filter({ hasText: fullName });
  await expect(pendingRow).toContainText('Chờ HR duyệt', { timeout: 15_000 });
  await pendingRow.click();
  const decideSheet = page.getByRole('dialog');
  await expect(decideSheet.getByText('NV: 4').first()).toBeVisible({ timeout: 15_000 });
  const decideButton = decideSheet.getByRole('button', { name: 'Ra quyết định' });
  await expect(decideButton).toBeEnabled({ timeout: 15_000 });
  await decideButton.click();
  await expect(decideSheet).toBeHidden({ timeout: 15_000 });

  await expect(page.getByRole('row').filter({ hasText: fullName })).toContainText(
    'Đã quyết định',
    { timeout: 15_000 }
  );
});
