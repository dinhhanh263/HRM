import { test, expect, type Page } from '@playwright/test';
import PDFDocument from 'pdfkit';

/**
 * Full happy-path E2E for the Recruitment / ATS critical path, run against the
 * live app + API + DB + BullMQ cv-parse worker. Drives the entire flow through
 * the real UI (no API seeding): login → create an OPEN job → create a candidate
 * → upload a CV (heuristic parser extracts fields) → add candidate to the job
 * → move the application a stage forward → schedule an interview (admin as
 * interviewer) → submit a STRONG_YES scorecard → hire.
 *
 * Asserts business outcomes on the application detail page (per the
 * coverage-not-proof rule): status = "Đã tuyển" (HIRED), the scorecard
 * aggregate reads 4.0, and the activity feed contains the full event sequence
 * (applied → stage changed → interview scheduled → hired). Everything is tagged
 * per-run so re-runs create fresh, isolated records.
 */

const ADMIN = { email: 'admin@codecrush.asia', password: 'Admin@123' };

/**
 * The logged-in admin user ("Super Admin") is linked to employee EMP-000.
 * Scorecard rights are tied to the *current user's own* employee, so this exact
 * person must be the interview's interviewer for the scorecard form to render.
 */
const ADMIN_NAME = 'Super Admin';

/** Unique-per-run suffix keeps created job/candidate records from colliding. */
function runTag(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** A CV body the HeuristicResumeParser can mine for email/phone/name/skills/years. */
function cvText(tag: string): string {
  return [
    `Tran Quoc Critical ${tag}`,
    `Email: cv.${tag}@example.com`,
    `Phone: +84901234567`,
    `GitHub: github.com/critical-${tag}`,
    ``,
    `Senior Software Engineer with 7 years of experience.`,
    `Skills: Node.js, TypeScript, React, PostgreSQL, Redis, Docker.`,
  ].join('\n');
}

/** Render the CV text into a real (text-extractable) PDF buffer. */
function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(12).text(text);
    doc.end();
  });
}

/** Future datetime in the `datetime-local` format the scheduler expects. */
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** Click a sidebar nav link and wait for the route to settle. */
async function navTo(page: Page, linkName: string, pathPrefix: string): Promise<void> {
  await page.getByRole('link', { name: linkName, exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith(pathPrefix), { timeout: 20_000 });
}

/** Pick an option in a Radix Select identified by its trigger id. */
async function selectOption(page: Page, triggerId: string, optionName: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

test('recruitment critical path: job → candidate → CV → application → interview → scorecard → hire', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tag = runTag();
  const jobTitle = `QA Critical ${tag}`;
  const candidateName = `Tran Quoc Critical ${tag}`;
  const candidateEmail = `cv.${tag}@example.com`;

  await login(page);

  // 1) Create an OPEN job (clone of the default pipeline).
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  const jobDialog = page.getByRole('dialog');
  await jobDialog.locator('#title').fill(jobTitle);
  await selectOption(page, 'status', 'Đang tuyển'); // default is DRAFT → set OPEN
  await jobDialog.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  await expect(page.getByRole('link', { name: jobTitle })).toBeVisible({ timeout: 15_000 });

  // 2) Create a candidate.
  await navTo(page, 'Ứng viên', '/recruitment/candidates');
  await page.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candDialog = page.getByRole('dialog');
  await candDialog.locator('#fullName').fill(candidateName);
  await candDialog.locator('#email').fill(candidateEmail);
  await candDialog.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candidateLink = page.getByRole('link', { name: new RegExp(candidateName) });
  await expect(candidateLink).toBeVisible({ timeout: 15_000 });

  // 3) Open candidate detail → Documents tab → upload a CV → parser extracts fields.
  await candidateLink.click();
  await page.waitForURL((url) => /\/recruitment\/candidates\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'Tài liệu' }).click();
  const pdf = await makePdf(cvText(tag));
  await page.locator('input[type="file"]').setInputFiles({
    name: `cv-${tag}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  // Worker parses asynchronously; the suggestion panel auto-appears when DONE.
  await expect(page.getByText('Đề xuất từ CV')).toBeVisible({ timeout: 45_000 });

  // 4) Add the candidate to the OPEN job.
  await page.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  const addDialog = page.getByRole('dialog');
  await selectOption(page, 'job', jobTitle);
  await addDialog.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  await expect(addDialog).toBeHidden({ timeout: 15_000 });

  // 5) Go to the job pipeline board (pipeline tab is the default).
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('link', { name: jobTitle }).click();
  await page.waitForURL((url) => /\/recruitment\/jobs\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  const candidateCardBtn = page.getByRole('button', {
    name: new RegExp(`Xem hồ sơ của ${candidateName}`),
  });
  await expect(candidateCardBtn).toBeVisible({ timeout: 15_000 });

  // 6) Open the detail sheet; capture the full-page application URL BEFORE hiring
  //    (hiring removes the card from the ACTIVE board).
  await candidateCardBtn.click();
  const sheet = page.getByRole('dialog');
  const fullPageLink = sheet.getByRole('link', { name: 'Mở trang đầy đủ' });
  await expect(fullPageLink).toBeVisible({ timeout: 15_000 });
  const applicationHref = await fullPageLink.getAttribute('href');
  expect(applicationHref).toBeTruthy();

  // 7) Schedule an interview with the admin as interviewer.
  await sheet.getByRole('button', { name: 'Lên lịch PV' }).click();
  await page.locator('#iv-when').fill(tomorrowLocal());
  await page.getByPlaceholder('Tìm nhân viên theo tên...').fill('Super');
  await sheet.getByRole('button', { name: new RegExp(ADMIN_NAME) }).first().click();
  await page.getByRole('button', { name: 'Lên lịch', exact: true }).click();
  await expect(sheet.getByText(/PV của tôi|10:00|Đã lên lịch/).first()).toBeVisible({
    timeout: 15_000,
  });

  // 8) Submit a STRONG_YES scorecard (admin is now an interviewer → form renders).
  await sheet.getByRole('button', { name: 'Rất nên tuyển' }).click();
  await sheet.getByRole('button', { name: 'Gửi đánh giá' }).click();
  await expect(sheet.getByText('Điểm trung bình')).toBeVisible({ timeout: 15_000 });

  // Close the sheet to return to the board.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  // 9) Move the application one stage forward (produces a STAGE_CHANGED event).
  //    The card menu trigger is a sibling of the name button; only one card is
  //    on the board, so a page-level locator is unambiguous.
  const cardMenu = page.getByRole('button', { name: 'Thao tác hồ sơ' });
  await cardMenu.click();
  const moveItem = page.getByRole('menu').getByRole('menuitem').first();
  await moveItem.click();

  // 10) Hire the candidate.
  await cardMenu.click();
  await page.getByRole('menuitem', { name: 'Tuyển ứng viên' }).click();
  const hireDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Tuyển ứng viên này?' }) });
  await expect(hireDialog).toBeVisible({ timeout: 15_000 });
  await hireDialog.getByRole('button', { name: 'Tuyển', exact: true }).click();
  await expect(candidateCardBtn).toBeHidden({ timeout: 15_000 });

  // 11) Assert business outcomes on the application detail page.
  await page.goto(applicationHref!);
  await page.waitForURL((url) => url.pathname === applicationHref, { timeout: 20_000 });

  // status = HIRED
  await expect(page.getByText('Đã tuyển').first()).toBeVisible({ timeout: 20_000 });
  // scorecard aggregate = 4.0 (STRONG_YES)
  await expect(page.getByText('4.0').first()).toBeVisible({ timeout: 15_000 });
  // activity feed sequence
  await expect(page.getByText('đã thêm ứng viên vào vị trí')).toBeVisible();
  await expect(page.getByText('đã chuyển bước').first()).toBeVisible();
  await expect(page.getByText('đã lên lịch phỏng vấn')).toBeVisible();
  await expect(page.getByText('đã tuyển ứng viên')).toBeVisible();
});

/**
 * SPEC-028 — OFFER stage-transition gate, end-to-end through the real UI.
 *
 * Business rule under test: an application cannot reach the OFFER stage until it
 * has BOTH a COMPLETED interview AND a submitted scorecard. Until then, moving to
 * OFFER is blocked; a force-capable actor (the admin is SUPER_ADMIN, which holds
 * recruitment:application_force_move) is routed through the reason dialog rather
 * than performing a silent move. Once a completed interview + submitted scorecard
 * exist, OFFER becomes a plain move and the card lands in the Offer stage.
 *
 * Seeds exactly enough state to make the gate flip observable (per the
 * coverage-not-proof rule), and asserts the outcome on the application detail
 * page: currentStage = "Đề nghị (Offer)".
 */
test('recruitment OFFER gate: blocked until a completed interview + submitted scorecard exist', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tag = runTag();
  const jobTitle = `Gate Job ${tag}`;
  const candidateName = `Gate Cand ${tag}`;
  const candidateEmail = `gate.${tag}@example.com`;

  await login(page);

  // 1) Create an OPEN job (clones the default pipeline incl. an OFFER stage).
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  const jobDialog = page.getByRole('dialog');
  await jobDialog.locator('#title').fill(jobTitle);
  await selectOption(page, 'status', 'Đang tuyển');
  await jobDialog.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  await expect(page.getByRole('link', { name: jobTitle })).toBeVisible({ timeout: 15_000 });

  // 2) Create a candidate (no CV needed — the gate is about interview + scorecard).
  await navTo(page, 'Ứng viên', '/recruitment/candidates');
  await page.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candDialog = page.getByRole('dialog');
  await candDialog.locator('#fullName').fill(candidateName);
  await candDialog.locator('#email').fill(candidateEmail);
  await candDialog.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candidateLink = page.getByRole('link', { name: new RegExp(candidateName) });
  await expect(candidateLink).toBeVisible({ timeout: 15_000 });

  // 3) Add the candidate to the OPEN job (from candidate detail).
  await candidateLink.click();
  await page.waitForURL((url) => /\/recruitment\/candidates\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  const addDialog = page.getByRole('dialog');
  await selectOption(page, 'job', jobTitle);
  await addDialog.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  await expect(addDialog).toBeHidden({ timeout: 15_000 });

  // 4) Open the job pipeline board.
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('link', { name: jobTitle }).click();
  await page.waitForURL((url) => /\/recruitment\/jobs\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  const cardBtn = page.getByRole('button', {
    name: new RegExp(`Xem hồ sơ của ${candidateName}`),
  });
  await expect(cardBtn).toBeVisible({ timeout: 15_000 });

  // 5) GATE UNMET — moving to OFFER must NOT be a silent move. The admin holds
  //    force capability, so selecting OFFER routes through the reason dialog.
  const cardMenu = page.getByRole('button', { name: 'Thao tác hồ sơ' });
  await cardMenu.click();
  await page.getByRole('menuitem', { name: 'Đề nghị (Offer)' }).click();
  const forceDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Chuyển bước khi chưa đủ điều kiện?' }) });
  await expect(forceDialog).toBeVisible({ timeout: 10_000 });
  // Abandon the override — the candidate must stay out of OFFER for now.
  await page.keyboard.press('Escape');
  await expect(forceDialog).toBeHidden({ timeout: 10_000 });

  // 6) Satisfy the gate: schedule an interview (admin as interviewer), submit a
  //    STRONG_YES scorecard, then mark the interview COMPLETED.
  await cardBtn.click();
  const sheet = page.getByRole('dialog');
  const fullPageLink = sheet.getByRole('link', { name: 'Mở trang đầy đủ' });
  await expect(fullPageLink).toBeVisible({ timeout: 15_000 });
  const applicationHref = await fullPageLink.getAttribute('href');
  expect(applicationHref).toBeTruthy();

  await sheet.getByRole('button', { name: 'Lên lịch PV' }).click();
  await page.locator('#iv-when').fill(tomorrowLocal());
  await page.getByPlaceholder('Tìm nhân viên theo tên...').fill('Super');
  await sheet.getByRole('button', { name: new RegExp(ADMIN_NAME) }).first().click();
  await page.getByRole('button', { name: 'Lên lịch', exact: true }).click();
  await expect(sheet.getByText(/PV của tôi|10:00|Đã lên lịch/).first()).toBeVisible({
    timeout: 15_000,
  });

  // Submit the scorecard (admin is the interviewer → the form renders).
  await sheet.getByRole('button', { name: 'Rất nên tuyển' }).click();
  await sheet.getByRole('button', { name: 'Gửi đánh giá' }).click();
  await expect(sheet.getByText('Điểm trung bình')).toBeVisible({ timeout: 15_000 });

  // Mark the interview COMPLETED (the second half of the gate condition).
  await sheet.getByRole('button', { name: 'Đổi trạng thái phỏng vấn' }).click();
  await page.getByRole('menuitem', { name: 'Đánh dấu hoàn thành' }).click();
  await expect(sheet.getByText('Hoàn thành').first()).toBeVisible({ timeout: 15_000 });

  // Close the sheet and reload so the board re-fetches offerGateMet.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  await page.reload();
  await expect(cardBtn).toBeVisible({ timeout: 15_000 });

  // 7) GATE MET — selecting OFFER is now a plain move (no reason dialog).
  await cardMenu.click();
  await page.getByRole('menuitem', { name: 'Đề nghị (Offer)' }).click();
  await expect(forceDialog).toBeHidden({ timeout: 5_000 });

  // 8) Assert the business outcome on the application detail page.
  await page.goto(applicationHref!);
  await page.waitForURL((url) => url.pathname === applicationHref, { timeout: 20_000 });
  await expect(page.getByText('Đề nghị (Offer)').first()).toBeVisible({ timeout: 20_000 });
});

/**
 * Drag a card (grabbed anywhere on its body) to a target column with enough
 * intermediate pointer moves to (a) clear the PointerSensor's 6px activation
 * distance — which also disambiguates drag from a plain click — and (b) let the
 * collision detection recompute the over-droppable before release.
 */
async function dragCardToColumn(page: Page, grab: ReturnType<Page['locator']>, columnName: string) {
  const column = page.locator(`div[aria-label="${columnName}"]`);
  // Bring the source card into view and grab it FIRST. Starting the drag locks
  // dnd-kit's droppable rect snapshot at the current scroll position; measuring
  // the target column afterwards keeps the DOM box and dnd's rects in the same
  // coordinate frame (the board is overflow-x:auto, so scroll drift between the
  // two measurements is what previously misrouted the drop one column to the right).
  await grab.scrollIntoViewIfNeeded();
  const hb = await grab.boundingBox();
  if (!hb) throw new Error('drag grab target not measurable');
  const startX = hb.x + hb.width / 2;
  const startY = hb.y + hb.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(60);
  // Pass the PointerSensor activation threshold so the drag is live.
  await page.mouse.move(startX + 12, startY + 10, { steps: 6 });
  await page.waitForTimeout(60);

  // Now measure the target column in the same (post-dragStart) scroll frame and
  // aim for its left-of-centre / upper area so the wide DragOverlay never bleeds
  // into the neighbouring column to the right.
  const cb = await column.boundingBox();
  if (!cb) throw new Error('target column not measurable');
  const endX = cb.x + cb.width * 0.4;
  const endY = cb.y + Math.min(cb.height / 2, 64);

  await page.mouse.move(endX, endY, { steps: 24 });
  await page.mouse.move(endX, endY, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/**
 * SPEC-029 — Pipeline drag-and-drop, end-to-end through the real UI.
 *
 * Two business outcomes, both routed through the SAME decision rule that the
 * "..." menu uses (resolveDropAction):
 *  1. Dragging a card to a normal stage performs a plain move → the card now
 *     lives under the target column.
 *  2. Dragging a gate-unmet card onto OFFER as a force-capable actor (admin is
 *     SUPER_ADMIN) does NOT silently move — it opens the force-reason dialog.
 *
 * Seeds just a job + candidate (no interview/scorecard) so the OFFER gate is
 * deliberately unmet, making the force-routing observable.
 */
test('recruitment pipeline drag-and-drop: move across a normal stage; OFFER gate routes to force dialog; hired card stays visible in HIRED column', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tag = runTag();
  const jobTitle = `DnD Job ${tag}`;
  const candidateName = `DnD Cand ${tag}`;
  const candidateEmail = `dnd.${tag}@example.com`;

  await login(page);

  // 1) Create an OPEN job (clones the default pipeline).
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  const jobDialog = page.getByRole('dialog');
  await jobDialog.locator('#title').fill(jobTitle);
  await selectOption(page, 'status', 'Đang tuyển');
  await jobDialog.getByRole('button', { name: 'Tạo tin tuyển dụng' }).click();
  await expect(page.getByRole('link', { name: jobTitle })).toBeVisible({ timeout: 15_000 });

  // 2) Create a candidate.
  await navTo(page, 'Ứng viên', '/recruitment/candidates');
  await page.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candDialog = page.getByRole('dialog');
  await candDialog.locator('#fullName').fill(candidateName);
  await candDialog.locator('#email').fill(candidateEmail);
  await candDialog.getByRole('button', { name: 'Thêm ứng viên' }).click();
  const candidateLink = page.getByRole('link', { name: new RegExp(candidateName) });
  await expect(candidateLink).toBeVisible({ timeout: 15_000 });

  // 3) Add the candidate to the OPEN job.
  await candidateLink.click();
  await page.waitForURL((url) => /\/recruitment\/candidates\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  const addDialog = page.getByRole('dialog');
  await selectOption(page, 'job', jobTitle);
  await addDialog.getByRole('button', { name: 'Thêm vào vị trí' }).click();
  await expect(addDialog).toBeHidden({ timeout: 15_000 });

  // 4) Open the job pipeline board. The card starts in the first stage.
  await navTo(page, 'Tuyển dụng', '/recruitment');
  await page.getByRole('link', { name: jobTitle }).click();
  await page.waitForURL((url) => /\/recruitment\/jobs\/[^/]+$/.test(url.pathname), {
    timeout: 20_000,
  });
  // The grip is still rendered as a visible affordance + keyboard activator…
  const handle = page.getByRole('button', {
    name: new RegExp(`Kéo để chuyển bước hồ sơ của ${candidateName}`),
  });
  await expect(handle).toBeVisible({ timeout: 15_000 });
  // …but pointer drag is carried by the WHOLE card now, so we grab the card body
  // (the open-detail button) to prove grab-anywhere works without opening detail.
  const cardBody = page
    .getByRole('button', { name: new RegExp(`Xem hồ sơ của ${candidateName}`) })
    .first();

  // 5) Drag the card to a normal stage ("Sàng lọc CV") → plain move. Assert the
  //    card now lives inside that column.
  await dragCardToColumn(page, cardBody, 'Sàng lọc CV');
  const screenColumn = page.locator('div[aria-label="Sàng lọc CV"]');
  await expect(
    screenColumn.getByRole('button', { name: new RegExp(`Xem hồ sơ của ${candidateName}`) })
  ).toBeVisible({ timeout: 15_000 });
  // Let the optimistic move's refetch settle so the next drag grabs a card whose
  // dnd listeners are fully attached (avoids a re-render race mid-pointerdown).
  await page.waitForLoadState('networkidle');

  // 6) Drag the (gate-unmet) card onto OFFER. As a force-capable actor, the drop
  //    must route through the force-reason dialog — never a silent move.
  await dragCardToColumn(page, cardBody, 'Đề nghị (Offer)');
  const forceDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Chuyển bước khi chưa đủ điều kiện?' }) });
  await expect(forceDialog).toBeVisible({ timeout: 10_000 });

  // Abandon the override — the card must stay in "Sàng lọc CV", not OFFER.
  await page.keyboard.press('Escape');
  await expect(forceDialog).toBeHidden({ timeout: 10_000 });
  await expect(
    screenColumn.getByRole('button', { name: new RegExp(`Xem hồ sơ của ${candidateName}`) })
  ).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');

  // 7) Hire the card (HIRED is a terminal stage; whether reached by drag or menu
  //    it routes through the same hire flow). REGRESSION GUARD: after the hire the
  //    card must NOT vanish — it stays visible as a frozen record in the HIRED
  //    column ("Đã tuyển"), and is gone from its old column.
  await screenColumn.getByRole('button', { name: 'Thao tác hồ sơ' }).click();
  await page.getByRole('menuitem', { name: 'Tuyển ứng viên' }).click();
  const hireDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Tuyển ứng viên này?' }) });
  await expect(hireDialog).toBeVisible({ timeout: 10_000 });
  await hireDialog.getByRole('button', { name: 'Tuyển', exact: true }).click();
  await expect(hireDialog).toBeHidden({ timeout: 10_000 });

  const hiredColumn = page.locator('div[aria-label="Đã tuyển"]');
  await expect(
    hiredColumn.getByRole('button', { name: new RegExp(`Xem hồ sơ của ${candidateName}`) })
  ).toBeVisible({ timeout: 15_000 });
  // …and it has left its old column — proving it moved rather than duplicated.
  await expect(
    screenColumn.getByRole('button', { name: new RegExp(`Xem hồ sơ của ${candidateName}`) })
  ).toBeHidden({ timeout: 10_000 });
});
