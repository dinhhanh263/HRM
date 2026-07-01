# Plan: SPEC-048 Ngân sách & Dòng tiền — GIAI ĐOẠN 1 (MVP)

> Spec: [docs/specs/048-budget-cash-flow.md](../docs/specs/048-budget-cash-flow.md)
> Phạm vi plan này = **chỉ GĐ1 (MVP)**: Tài khoản quỹ + Danh mục + Sổ giao dịch (nhập tay +
> import Excel) + Dashboard số dư & dòng tiền in/out. GĐ2–4 lên plan riêng sau khi MVP chạy.

## Nguyên tắc
- **Lát cắt dọc**: mỗi task đi hết DB → API → UI, verify được ngay.
- **Nhân bản Purchase Request** (analog gần nhất: đa pháp nhân + import Excel). Không phát minh
  pattern mới.
- **Tiền = `Decimal(14,2)`**, không float. Số dư **không nhập tay** — luôn recompute.
- Tenant-scoped + RBAC server-side + đổi số dư nằm trong DB transaction.

## Bối cảnh code — file mẫu để mirror (đường dẫn thật)

**Backend (`apps/api`)**
- Đăng ký route: `src/app/routes/index.ts` (`router.use('/purchase-requests', ...)`)
- Routes mẫu: `src/app/routes/v1/purchase-request.routes.ts` (`asyncHandler(requirePermission('...'))`)
- Controller mẫu: `src/app/controllers/purchase-request.controller.ts` (resolveCurrentEmployee, scope)
- Service/Repo: `src/domain/services/purchase-request.service.ts`, `src/domain/repositories/purchase-request.repository.ts`
- Validator: `src/app/validators/purchase-request.validator.ts` (Zod body + query)
- Import Excel (ExcelJS, stateless): `src/domain/purchase-request-import/*` (parser, validator, parse.service)
- RBAC catalog keys: `packages/shared/src/types/rbac.ts` (`PERMISSION_CATALOG`)
- RBAC role→perm: `apps/api/src/domain/rbac/catalog.ts`; seed: `pnpm --filter @hrm/api db:seed:rbac`
- Prisma: `apps/api/prisma/schema.prisma` (models `IssuingEntity` L~1097, `Department` L~494);
  migrate: `pnpm --filter @hrm/api db:migrate`

**Frontend (`apps/web`)**
- Feature folder mẫu: `src/features/purchase-request/` (pages/ components/ hooks/ utils.ts index.ts)
- Axios instance: `src/lib/api-client.ts` (baseURL `/api/v1`)
- Hook mẫu: `src/features/purchase-request/hooks/usePurchaseRequests.ts` (TanStack Query + queryKeys)
- Router: `src/router.tsx` (`<RequirePermission permission="...">`)
- Sidebar nav config: `src/config/nav.ts` (group `groups.finance` đã có; `NavItem {icon,labelKey,href,permission}`)
- i18n: `src/i18n/index.ts` (đăng ký namespace + resources); locales `src/i18n/locales/{vi,en}/*.json`

## Data model MVP (chỉ 3 model + enums — xem spec để đủ)
`FundAccount`, `FinanceCategory`, `CashTransaction` + enums `TransactionDirection`,
`TransactionStatus`, `CategoryKind`, `FundAccountType`, `TransactionSource`.
(SpendingPlan/TopUpRequest thuộc GĐ2/3 — **không** tạo ở MVP.)

## Permissions MVP (thêm vào catalog)
```
finance:          ['view', 'export']
fund_account:     ['view', 'create', 'update', 'delete']
cash_transaction: ['view', 'create', 'update', 'delete', 'import']
```
`SUPER_ADMIN` implicit-all; `HR_MANAGER` = tất cả các quyền trên. (spending_plan/topup_request
thêm ở GĐ2/3.)

---

## Task 1 — Foundation: schema + shared types + RBAC (enabling)

**Objective:** Có model DB, DTO types dùng chung, và permission keys — nền cho mọi slice sau.

**Files:**
- `apps/api/prisma/schema.prisma` — thêm 3 model + 5 enum MVP; back-relations vào `Tenant`,
  `IssuingEntity`, `Department` (additive).
- migration mới: `pnpm --filter @hrm/api db:migrate` (tên: `add_budget_cash_flow_mvp`).
- `packages/shared/src/types/rbac.ts` — thêm `finance`, `fund_account`, `cash_transaction` vào `PERMISSION_CATALOG`.
- `packages/shared/src/types/finance.ts` (mới) — DTO: `FundAccountDto`, `FinanceCategoryDto`,
  `CashTransactionDto`, request/response types, filters; export qua `packages/shared/src/index.ts`.
- `apps/api/src/domain/rbac/catalog.ts` — gán các quyền mới cho `HR_MANAGER`.

**Acceptance:**
- [ ] `prisma generate` + migrate chạy sạch; client có 3 model.
- [ ] `@hrm/shared` build sạch; types import được ở cả api & web.
- [ ] `pnpm --filter @hrm/api db:seed:rbac` gán quyền finance/fund_account/cash_transaction cho HR_MANAGER.
- [ ] Type-check toàn repo pass.

**Dependencies:** none. **Verify:** build + migrate + seed rbac; đăng nhập HR thấy quyền mới trong `/settings/roles`.

---

## Task 2 — Slice: Tài khoản quỹ (Fund Account CRUD)

**Objective:** HR tạo/sửa/vô hiệu/liệt kê tài khoản quỹ theo pháp nhân; thấy số dư (khởi tạo = openingBalance).

**Files (BE):** `validators/finance-account.validator.ts`, `repositories/fund-account.repository.ts`,
`services/fund-account.service.ts`, `controllers/fund-account.controller.ts`,
`routes/v1/fund-account.routes.ts`, mount trong `routes/index.ts` (`/fund-accounts`).
**Files (FE):** `features/finance/hooks/useFundAccounts.ts`, `features/finance/components/FundAccountTable.tsx`,
`FundAccountFormSheet.tsx`, page `pages/FundAccountsPage.tsx`; route trong `router.tsx`
(`/finance/accounts`, perm `fund_account:view`); nav item + i18n `finance.json`.

**Acceptance:**
- [ ] CRUD: `name`, `type`, `issuingEntityId` (bắt buộc), `currency` default VND, `openingBalance`.
- [ ] `currentBalance` khởi tạo = `openingBalance`; **không** field nhập tay trên form.
- [ ] Vô hiệu hoá (`active=false`) thay vì xoá nếu đã có giao dịch (MVP: chưa có giao dịch → có thể xoá).
- [ ] List lọc theo pháp nhân; badge pháp nhân; số dùng `tabular-nums`.
- [ ] RBAC server-side; tenant-scoped.

**Dependencies:** Task 1. **Verify:** unit (service) + integration (RBAC 403 khi thiếu quyền); tạo 2 tài khoản 2 pháp nhân, lọc đúng.

---

## Task 3 — Slice: Danh mục (Finance Category) + seed mặc định

**Objective:** Quản lý danh mục thu/chi phân cấp; seed sẵn bộ danh mục VN thường dùng.

**Files (BE):** `validators/finance-category.validator.ts`, `repositories/finance-category.repository.ts`,
`services/finance-category.service.ts`, `controllers/finance-category.controller.ts`,
routes `/finance-categories` (view gate `finance:view`, ghi gate `cash_transaction:create`);
seed danh mục mặc định (per-tenant, idempotent) — thêm vào seed hoặc lazy-create khi tenant lần đầu truy cập.
**Files (FE):** `hooks/useFinanceCategories.ts`, `components/CategoryManagerSheet.tsx` (quản lý trong trang Cài đặt tài chính hoặc inline).

**Acceptance:**
- [ ] CRUD danh mục, `kind` INCOME|EXPENSE, `parentId` ≤ 2 cấp.
- [ ] Seed: EXPENSE (Ads, Hàng hoá, Văn phòng phẩm, Thuê văn phòng, Freelancer, Lương, Thuế/Phí, Khác) + INCOME (Ecom, Nguồn khác).
- [ ] Không xoá danh mục đang gắn giao dịch (vô hiệu hoá).

**Dependencies:** Task 1. **Verify:** seed tạo đúng cây danh mục cho tenant; unit ràng buộc không-xoá-khi-đang-dùng.

---

## Checkpoint A — Master data sẵn sàng
- [ ] Có tài khoản quỹ + danh mục; RBAC + tenant + đa pháp nhân đúng; test pass; không lỗi console.

---

## Task 4 — Slice: Sổ giao dịch thu/chi (nhập tay) + recompute số dư  ⚠️ RISK-FIRST

**Objective:** HR nhập/sửa/xoá giao dịch IN/OUT; danh sách + bộ lọc + tổng IN/OUT/net; số dư
tài khoản tự cập nhật **nguyên tử**.

**Files (BE):** `validators/cash-transaction.validator.ts` (body + query filter),
`repositories/cash-transaction.repository.ts`, `services/cash-transaction.service.ts`
(**logic recompute `currentBalance` trong `prisma.$transaction`** khi create/update/delete),
`controllers/cash-transaction.controller.ts`, routes `/cash-transactions` (view/create/update/delete gates).
**Files (FE):** `hooks/useCashTransactions.ts`, `components/CashTransactionTable.tsx` (toolbar: search
debounce 300ms, filter pháp nhân/tài khoản/danh mục/bộ phận/chiều/trạng thái/khoảng ngày, sort, phân trang),
`CashTransactionFormSheet.tsx`, `pages/CashTransactionsPage.tsx`; route `/finance/transactions`; nav item; i18n.

**Acceptance:**
- [ ] Tạo giao dịch: `accountId`, `direction`, `amount>0`, `occurredAt`, `categoryId`, `departmentId?`,
      `issuingEntityId` (default lấy từ account), `description`, `reference`, `status` default `ACTUAL`.
- [ ] Create/update/delete **ACTUAL** → recompute `currentBalance` account liên quan **trong cùng transaction**.
- [ ] Giao dịch `PLANNED` **không** ảnh hưởng số dư.
- [ ] List: filter đầy đủ, tổng **IN/OUT/net** theo bộ lọc, phân trang server-side, số `tabular-nums`.
- [ ] Empty/skeleton/error đầy đủ; badge chiều IN/OUT màu+chữ.

**Dependencies:** Task 2, 3. **Verify:** **TDD cho recompute** (nhiều IN/OUT, sửa amount, đổi account, xoá → số dư đúng); integration RBAC + tenant; E2E: 1 IN + 1 OUT → số dư & tổng đúng.

---

## Task 5 — Slice: Import Excel/CSV giao dịch (template → parse → preview → confirm)

**Objective:** HR import nhiều giao dịch từ file; đối chiếu lỗi trước khi ghi.

**Files (BE):** `domain/cash-transaction-import/` (parser ExcelJS, validator per-row, parse.service —
**nhân bản** `purchase-request-import/`), controller `import/{template,parse,confirm}`, routes gate `cash_transaction:import`.
**Files (FE):** `components/CashTransactionImportSheet.tsx` (nhân bản `PurchaseItemImportSheet`),
`hooks/useCashTransactionImport.ts`; nút "Import" trên toolbar sổ giao dịch.

**Acceptance:**
- [ ] `GET import/template` trả xlsx/csv có cột chuẩn (account, direction, amount, date, category, department, reference, description).
- [ ] `POST import/parse` **stateless**: trả `{totalRows, validCount, errorCount, rows:[{rowNumber,data,errors}]}`;
      bắt lỗi: account/category không tồn tại, amount≤0, ngày sai, direction sai.
- [ ] `POST import/confirm` tạo hàng loạt (chỉ dòng hợp lệ) + recompute số dư trong transaction.
- [ ] UI preview: highlight dòng lỗi, chặn confirm nếu chọn dòng lỗi; báo số tạo thành công.

**Dependencies:** Task 4. **Verify:** unit parser (xlsx + csv, header sai); E2E: import 3 dòng (1 lỗi) → preview chặn dòng lỗi, confirm 2 dòng, số dư cập nhật.

---

## Checkpoint B — Ghi nhận dòng tiền hoàn chỉnh
- [ ] Nhập tay + import đều tạo giao dịch đúng; số dư luôn khớp; coverage recompute/import > 80%.

---

## Task 6 — Slice: Dashboard Dòng tiền (MVP)

**Objective:** Màn hình tổng quan trả lời trong 5 giây: số dư, thu/chi kỳ, net, biểu đồ in/out, chi theo danh mục.

**Files (BE):** endpoint `GET /finance/dashboard` (gate `finance:view`) trong controller/service finance
(aggregate theo pháp nhân + kỳ): tổng số dư, ACTUAL IN, ACTUAL OUT, net, chuỗi in/out theo ngày, top danh mục chi.
**Files (FE):** `hooks/useFinanceDashboard.ts`, `pages/FinanceDashboardPage.tsx`,
`components/CashFlowKpiCards.tsx`, `InOutChart.tsx` (Recharts), `CategoryBreakdownTable.tsx`;
route `/finance` (gate `finance:view`); nav item "Tổng quan tài chính"; i18n.

**Acceptance:**
- [ ] Bộ chọn **pháp nhân** (một | tất cả) + **kỳ** (default tháng hiện tại).
- [ ] KPI: Tổng số dư · Thu trong kỳ · Chi trong kỳ · Net kỳ (`tabular-nums`).
- [ ] Biểu đồ cột IN/OUT theo ngày + đường số dư luỹ kế.
- [ ] Bảng chi theo danh mục (top hạng mục).
- [ ] Skeleton khi load; empty state có CTA tạo tài khoản/giao dịch.

**Dependencies:** Task 4 (dữ liệu ACTUAL). **Verify:** unit aggregate (tổng, group theo ngày/danh mục, lọc pháp nhân); E2E: seed vài giao dịch → KPI & chart đúng.

---

## Checkpoint C — MVP hoàn chỉnh (sẵn sàng /test → /review)
- [ ] 3 màn (Tài khoản, Sổ giao dịch, Dashboard) + import chạy end-to-end.
- [ ] RBAC server-side + tenant + đa pháp nhân đúng ở mọi endpoint.
- [ ] i18n vi+en đủ; dark mode; design token (no hex); WCAG AA; responsive 768–1440.
- [ ] Coverage ≥ 80%; E2E critical-path pass; không lỗi console/network.

## Ngoài phạm vi plan này (GĐ sau)
Kế hoạch chi bộ phận + duyệt, Budget vs Actual, Dự báo/cảnh báo thiếu hụt (GĐ2); Đề xuất nạp
quỹ + PDF + báo cáo đa pháp nhân (GĐ3); auto-kéo PR/Payment + tích hợp API ngân hàng/Ecom (GĐ4).
