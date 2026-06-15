import { test, expect, type Page } from '@playwright/test';

/**
 * SPEC-030 — Probation Review critical path, end-to-end through the real UI
 * (live app + API + DB), driven by a single SUPER_ADMIN actor.
 *
 * The business outcome under test is the ATOMIC consequence of an HR CONFIRM
 * decision: confirming a probationary employee must, in one transaction, flip
 * the employee to a FULL_TIME contract (employee.contractType = FULL_TIME) and
 * create a new ACTIVE full-time contract while expiring the probation one. The
 * manager→HR role handoff is exercised separately by server-side integration
 * tests (RBAC scope is non-negotiable there); here we prove the end-to-end flow
 * produces the observable outcome. Admin holds probation:review + probation:decide
 * and views all reviews, so a single login can drive create → score → submit →
 * CONFIRM without losing the assertion's value.
 *
 * Seeds exactly enough state to make the effect observable (per the
 * coverage-not-proof rule): a fresh PROBATION + ACTIVE employee created through
 * the real form. Asserts the outcome on the employee detail page: contract type
 * reads "Toàn thời gian" (FULL_TIME), not "Thử việc" (PROBATION).
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };

/** Unique-per-run suffix keeps created employee/review records from colliding. */
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

test('probation critical path: create PROBATION employee → manager scorecard (CONFIRM) → HR CONFIRM → employee becomes FULL_TIME', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const fullName = `Thử Việc ${tag}`;
  const email = `probation.${tag}@example.com`;

  await login(page);

  // 1) Create a fresh PROBATION + ACTIVE employee through the real form. Capture
  //    the created id from the API response so we can assert on its detail page.
  await page.goto('/employees/new');
  await page.getByPlaceholder('email@company.com').fill(email);
  await page.locator('input[type="password"]').fill('Probation@123');
  await page.getByPlaceholder('Nguyễn Văn A').fill(fullName);

  // contractType defaults to FULL_TIME ("Toàn thời gian"); switch it to PROBATION.
  await page.getByRole('combobox').filter({ hasText: 'Toàn thời gian' }).click();
  await page.getByRole('option', { name: 'Thử việc' }).click();

  const createResponse = page.waitForResponse(
    (res) =>
      res.url().includes('/api/v1/employees') &&
      res.request().method() === 'POST' &&
      res.status() === 201
  );
  await page.getByRole('button', { name: 'Tạo nhân viên' }).click();
  const employeeId = (await (await createResponse).json()).data.id as string;
  expect(employeeId).toBeTruthy();
  await page.waitForURL((url) => url.pathname === '/employees', { timeout: 20_000 });

  // 2) Open the Probation page and create a draft review for that employee.
  await page.goto('/probation');
  await page.getByRole('button', { name: 'Tạo đánh giá' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(fullName) }).click();
  await createDialog.getByRole('button', { name: 'Tạo', exact: true }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });

  // 3) Open the new review row → manager scorecard. Score every criterion (5),
  //    recommend CONFIRM, and submit (review moves DRAFT → PENDING_HR).
  const row = page.getByRole('row').filter({ hasText: fullName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 15_000 });

  const groups = sheet.locator('[role="radiogroup"]');
  const groupCount = await groups.count();
  expect(groupCount).toBeGreaterThan(0);
  for (let i = 0; i < groupCount; i++) {
    await groups.nth(i).getByRole('radio', { name: '5' }).click();
  }

  await sheet.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Đạt — ký chính thức' }).click();
  await sheet.getByRole('button', { name: 'Nộp' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // 4) Re-open the row as HR. The decision panel renders (status PENDING_HR);
  //    the decision defaults to the manager's CONFIRM recommendation, so the
  //    "Ra quyết định" action is immediately submittable.
  const pendingRow = page.getByRole('row').filter({ hasText: fullName });
  await expect(pendingRow).toContainText('Chờ HR duyệt', { timeout: 15_000 });
  await pendingRow.click();
  const decideSheet = page.getByRole('dialog');
  const decideButton = decideSheet.getByRole('button', { name: 'Ra quyết định' });
  await expect(decideButton).toBeEnabled({ timeout: 15_000 });
  await decideButton.click();
  await expect(decideSheet).toBeHidden({ timeout: 15_000 });

  // The review is now DECIDED in the list.
  await expect(
    page.getByRole('row').filter({ hasText: fullName })
  ).toContainText('Đã quyết định', { timeout: 15_000 });

  // 5) Assert the business outcome: the employee's CURRENT contract type is now
  //    FULL_TIME. Scope to the "Loại hợp đồng" field's value so the (legitimate)
  //    EXPIRED probation contract still listed in history doesn't trip the check.
  await page.goto(`/employees/${employeeId}`);
  await page.waitForURL((url) => url.pathname === `/employees/${employeeId}`, { timeout: 20_000 });
  const contractTypeValue = page
    .locator('dt', { hasText: 'Loại hợp đồng' })
    .locator('xpath=following-sibling::dd[1]');
  await expect(contractTypeValue).toHaveText('Toàn thời gian', { timeout: 20_000 });
});

/**
 * SPEC-031 — Evaluation framework critical path. Business outcome under test:
 * a manager scoring with the framework (rubric guide per criterion, What/How
 * sub-scores) and logging deliverable evidence produces a submitted review in
 * which HR SEES the evidence (title + clickable external link). Seeds its own
 * framework state through the real settings UI: a VALUES criterion with a full
 * 5-level rubric, so the test does not depend on tenant seed data.
 */
test('probation framework: configure rubric criterion → scorecard shows guide + sub-scores → deliverable evidence submitted → HR sees evidence link', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const criterionName = `Văn hóa ${tag}`;
  const fullName = `Khung ĐG ${tag}`;
  const email = `framework.${tag}@example.com`;
  const evidenceTitle = `Tích hợp SSO ${tag}`;
  const evidenceLink = `https://app.clickup.com/t/${tag}`;

  await login(page);

  // 1) HR configures a VALUES criterion with a 5-level rubric via the settings tab.
  await page.goto('/probation');
  await page.getByRole('button', { name: 'Tiêu chí' }).click();
  await page.getByRole('button', { name: 'Thêm tiêu chí' }).click();
  const criteriaDialog = page.getByRole('dialog');
  await criteriaDialog.locator('#pc-name').fill(criterionName);
  await criteriaDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Giá trị & Văn hóa/ }).click();
  const levelLabels = ['Chưa đạt', 'Cần cải thiện', 'Đạt kỳ vọng', 'Trên kỳ vọng', 'Xuất sắc'];
  for (let i = 0; i < 5; i++) {
    await criteriaDialog.locator(`input[name="rubric.${i}.level"]`).fill(levelLabels[i]);
    await criteriaDialog
      .locator(`input[name="rubric.${i}.observable"]`)
      .fill(`Biểu hiện mức ${i + 1}`);
  }
  await criteriaDialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(criteriaDialog).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByRole('row').filter({ hasText: criterionName })
  ).toContainText('Giá trị', { timeout: 15_000 });

  // 2) Seed a fresh PROBATION employee through the real form.
  await page.goto('/employees/new');
  await page.getByPlaceholder('email@company.com').fill(email);
  await page.locator('input[type="password"]').fill('Probation@123');
  await page.getByPlaceholder('Nguyễn Văn A').fill(fullName);
  await page.getByRole('combobox').filter({ hasText: 'Toàn thời gian' }).click();
  await page.getByRole('option', { name: 'Thử việc' }).click();
  await page.getByRole('button', { name: 'Tạo nhân viên' }).click();
  await page.waitForURL((url) => url.pathname === '/employees', { timeout: 20_000 });

  // 3) Create the draft review.
  await page.goto('/probation');
  await page.getByRole('button', { name: 'Tạo đánh giá' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(fullName) }).click();
  await createDialog.getByRole('button', { name: 'Tạo', exact: true }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });

  // 4) Manager scorecard: What/How group headers + rubric guide popover.
  const row = page.getByRole('row').filter({ hasText: fullName });
  await row.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText('Hiệu suất (What)')).toBeVisible();
  await expect(sheet.getByText('Giá trị & Văn hóa (How)')).toBeVisible();

  // The rubric guide opens and shows the behavioral anchors for the criterion.
  const guideButton = sheet.getByRole('button', {
    name: `Hướng dẫn chấm điểm: ${criterionName}`,
  });
  await guideButton.click();
  await expect(page.getByText('Trên kỳ vọng')).toBeVisible();
  await expect(page.getByText('Biểu hiện mức 4')).toBeVisible();
  // Close via the trigger toggle — Escape would close the whole Sheet layer.
  await guideButton.click();
  await expect(page.getByText('Biểu hiện mức 4')).toBeHidden();

  // Score every criterion 4 → both group sub-scores read 4.0.
  const groups = sheet.locator('[role="radiogroup"]');
  const groupCount = await groups.count();
  expect(groupCount).toBeGreaterThan(0);
  for (let i = 0; i < groupCount; i++) {
    await groups.nth(i).getByRole('radio', { name: '4' }).click();
  }
  await expect(sheet.getByText('4.0').first()).toBeVisible();

  // 5) Log deliverable evidence (title + real link) and submit with CONFIRM.
  await sheet.getByRole('button', { name: 'Thêm bằng chứng' }).click();
  await sheet.locator('input[placeholder^="Tên đầu việc"]').fill(evidenceTitle);
  await sheet.locator('input[placeholder^="https://"]').fill(evidenceLink);
  await sheet.getByRole('combobox').filter({ hasText: /^Kết quả$/ }).click();
  await page.getByRole('option', { name: 'Đạt', exact: true }).click();
  await sheet.getByRole('combobox').filter({ hasText: 'Chọn kết quả đề xuất' }).click();
  await page.getByRole('option', { name: 'Đạt — ký chính thức' }).click();
  await sheet.getByRole('button', { name: 'Nộp' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // 6) HR re-opens the submitted review: the evidence is read-only and the link
  //    opens externally — the business outcome HR needs to verify the work.
  const pendingRow = page.getByRole('row').filter({ hasText: fullName });
  await expect(pendingRow).toContainText('Chờ HR duyệt', { timeout: 15_000 });
  await pendingRow.click();
  const hrSheet = page.getByRole('dialog');
  await expect(hrSheet.getByText(evidenceTitle)).toBeVisible({ timeout: 15_000 });
  const evidenceAnchor = hrSheet.locator(`a[href="${evidenceLink}"]`);
  await expect(evidenceAnchor).toBeVisible();
  await expect(evidenceAnchor).toHaveAttribute('target', '_blank');
  await expect(evidenceAnchor).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(hrSheet.getByText('Đạt', { exact: true })).toBeVisible();
});
