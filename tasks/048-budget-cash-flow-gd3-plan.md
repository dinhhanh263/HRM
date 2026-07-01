# Plan: SPEC-048 Ngân sách & Dòng tiền — GIAI ĐOẠN 3

> Spec: [docs/specs/048-budget-cash-flow.md](../docs/specs/048-budget-cash-flow.md) · Nối tiếp GĐ1 (#17) + GĐ2 (#18, #19).
> Phạm vi: **Đề xuất nạp quỹ** (trình Founder, tự sinh giải trình, duyệt → tự ghi nhận nạp, xuất PDF) + **Báo cáo đa pháp nhân**.

## Nguyên tắc
- Lát cắt dọc; nhân bản pattern finance (validator/repo/service/controller/routes; feature/finance web).
- Tiền `Decimal(14,2)`; tenant-scoped; RBAC server-side.
- Risk-first: (a) **duyệt → tự sinh giao dịch IN "Nạp quỹ" + recompute số dư nguyên tử**; (b) giải trình tự sinh đúng số liệu. Cả hai TDD.

## Data model mới (Prisma)
- `enum TopUpStatus { PENDING APPROVED REJECTED CANCELLED }`
- `TopUpRequest` (tenantId, issuingEntityId, title, amount, currency, neededByDate?, period?, justification text, status, reviewedById/At/Note, fundedAccountId?, fundedAt?, createdById) + back-relations.

## Permissions mới (catalog)
```
topup_request: ['view', 'create', 'approve', 'reject', 'export']
```
- SUPER_ADMIN (Founder): * (duyệt/từ chối) · HR_MANAGER: view, create, export (lập & trình) · MANAGER/EMPLOYEE: —
- Đề xuất nạp quỹ là chức năng Tài chính công ty → list company-wide cho ai có `topup_request:view` (không scope theo người tạo).

---

## G3-1 — Foundation: schema + types + RBAC (enabling)
**Files:** schema.prisma (+TopUpRequest +enum +back-relations) + migration `add_topup_request`; shared `finance.ts` (TopUpRequestDto, create/review/list, justification-preview); rbac.ts (+topup_request); catalog.ts (HR + Founder).
**Acceptance:** migrate + generate sạch; shared build; seed rbac; typecheck.

## G3-2 — Slice: Đề xuất nạp quỹ (tạo + giải trình tự sinh + Founder duyệt) ⚠️ RISK-FIRST TDD
**Objective:** HR lập đề xuất nạp quỹ (giải trình gợi ý tự động), Founder duyệt/từ chối; duyệt → tuỳ chọn tự sinh giao dịch IN "Nạp quỹ".
**BE:** `GET /topup-requests/justification-draft?issuingEntityId=&month=` → text gợi ý (tổng kế hoạch APPROVED + thiếu hụt dự báo). CRUD `/topup-requests`: create (PENDING), cancel (owner, PENDING), `POST /:id/review {decision, note, fundedAccountId?}`:
 - APPROVED + fundedAccountId → tạo `CashTransaction` IN ACTUAL (category "Nạp quỹ / Góp vốn") + `recomputeAccountBalance` trong `$transaction`; set fundedAt.
 - REJECTED (note bắt buộc). Gate: create/view HR; approve/reject Founder.
**FE:** feature/finance: `useTopUpRequests`, trang `TopUpRequestsPage` (list + tạo qua Sheet có nút "Tạo giải trình tự động" + chọn kỳ/pháp nhân/số tiền), Founder review (duyệt kèm chọn tài khoản nạp / từ chối kèm lý do); route `/finance/topup-requests`, nav, i18n.
**Acceptance:** vòng đời PENDING→APPROVED/REJECTED/CANCELLED; duyệt+tài khoản → số dư tăng đúng; RBAC (HR không duyệt, Founder duyệt); banner Dashboard "Tạo đề xuất nạp quỹ" trỏ tới trang này.
**Verify:** TDD duyệt→recompute; integration RBAC; E2E: tạo→Founder duyệt→số dư tăng.

## G3-3 — Slice: Xuất PDF giải trình
**Objective:** Xuất PDF bản giải trình để trình/lưu.
**BE:** `GET /topup-requests/:id/pdf` (gate `topup_request:export`) — nhân bản hạ tầng render PDF của Purchase Request (pdfkit): tiêu đề pháp nhân, số tiền, kỳ, ngày cần, giải trình, trạng thái.
**FE:** nút "Xuất PDF" trên chi tiết/hàng đề xuất (tải blob, tái dùng `saveBlob`).
**Acceptance:** PDF tải được, đúng nội dung + pháp nhân; RBAC.

## Checkpoint A — Đề xuất nạp quỹ end-to-end (tạo→duyệt→nạp→PDF)

## G3-4 — Slice: Báo cáo đa pháp nhân (+ Excel)
**Objective:** Báo cáo thu/chi theo **tháng / bộ phận / danh mục / pháp nhân**; xuất Excel.
**BE:** `GET /finance/report?year=&issuingEntityId=` → tổng hợp theo tháng + theo danh mục/bộ phận/pháp nhân; `GET /finance/report/export` (Excel, gate `finance:export`).
**FE:** trang `FinanceReportPage` (chọn năm/pháp nhân, bảng + nút xuất Excel); route `/finance/reports`, nav.
**Acceptance:** số liệu khớp ACTUAL; tách theo pháp nhân + tổng gộp; Excel tải được.

## Checkpoint B — GĐ3 hoàn chỉnh → /test → /review
- [ ] Đề xuất nạp quỹ (tạo→duyệt→nạp→PDF) + Báo cáo đa pháp nhân chạy end-to-end.
- [ ] RBAC (HR lập, Founder duyệt) + tenant + đa pháp nhân; recompute số dư nguyên tử khi duyệt.
- [ ] coverage logic duyệt/nạp + giải trình > 80%; 0 regression toàn API; web typecheck; verify browser.

## Ngoài phạm vi (GĐ4): auto-kéo PR/Payment/Payroll vào sổ chi; tích hợp API Ecom/ngân hàng.
