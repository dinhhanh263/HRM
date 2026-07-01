# Plan: SPEC-048 Ngân sách & Dòng tiền — GIAI ĐOẠN 2

> Spec: [docs/specs/048-budget-cash-flow.md](../docs/specs/048-budget-cash-flow.md) · Nối tiếp GĐ1 (PR #17).
> Phạm vi: **Kế hoạch chi theo bộ phận** + **Budget vs Actual** + **Dự báo & cảnh báo thiếu hụt**.

## Nguyên tắc
- Lát cắt dọc DB → API → UI; nhân bản pattern GĐ1 (validator/repo/service/controller/routes; feature/finance web).
- Tiền `Decimal(14,2)`; tenant-scoped; RBAC server-side.
- **Risk-first**: (a) ràng buộc "MANAGER chỉ thao tác bộ phận mình" (bảo mật), (b) logic **dự báo** (ngày cạn tiền / thiếu hụt) — cả hai làm TDD.

## Data model mới (Prisma)
- `SpendingPlan` (tenantId, departmentId, issuingEntityId, period "YYYY-MM", status, totalAmount denorm, submittedById/At, reviewedById/At, reviewNote) — `@@unique([departmentId, period, issuingEntityId])`.
- `SpendingPlanItem` (planId, categoryId?, title, amount, expectedDate?, note).
- enum `SpendingPlanStatus { DRAFT SUBMITTED APPROVED REJECTED }`.
- Back-relations: Tenant, Department, IssuingEntity, FinanceCategory.

## Permissions mới (catalog)
```
spending_plan: ['view', 'create', 'update', 'submit', 'approve', 'reject']
```
- SUPER_ADMIN: * · HR_MANAGER: view, approve, reject · MANAGER: view, create, update, submit (**scope bộ phận mình ở service**) · EMPLOYEE: —
- Forecast + Budget-vs-Actual gate `finance:view` (HR/Founder — đã có).

---

## Task 1 — Foundation: schema + shared types + RBAC (enabling)
**Files:** schema.prisma (+2 model +1 enum +back-relations) + migration `add_spending_plan`; `packages/shared/src/types/finance.ts` (SpendingPlanDto, item, requests, list, review, BudgetVsActual*, Forecast*); `rbac.ts` (+spending_plan); `domain/rbac/catalog.ts` (HR + MANAGER).
**Acceptance:** migrate + generate sạch; `@hrm/shared` build; seed rbac gán quyền; typecheck toàn repo.
**Verify:** build + migrate + seed; quyền hiện trong /settings/roles.

## Task 2 — Slice: Kế hoạch chi (MANAGER tạo/sửa/gửi) ⚠️ scope TDD
**Objective:** Trưởng bộ phận tạo kế hoạch chi cho **bộ phận mình + kỳ**, thêm dòng, gửi duyệt.
**Files (BE):** validator/repo/service/controller/routes `/spending-plans`. Service enforce "manager của departmentId" (từ Department.managerId hoặc employee.departmentId) — chỉ thao tác plan bộ phận mình; `totalAmount` = Σ item; vòng đời DRAFT→SUBMITTED; unique dept+period+entity.
**Files (FE):** feature/finance: `useSpendingPlans`, trang `SpendingPlansPage` (danh sách plan của tôi + tạo/sửa qua Sheet với item editor), route `/finance/spending-plans`, nav item, i18n.
**Acceptance:** tạo/sửa DRAFT + items (category cùng kind EXPENSE, amount>0, expectedDate trong kỳ); submit → SUBMITTED; **không** sửa được sau SUBMITTED (trừ khi bị REJECTED → sửa & gửi lại); MANAGER khác bộ phận → 403.
**Verify:** unit scope + totalAmount; integration RBAC; E2E: manager tạo→gửi.
**Dep:** Task 1.

## Task 3 — Slice: HR duyệt + tổng hợp
**Objective:** HR/Finance xem tổng hợp toàn công ty + duyệt/từ chối.
**Files (BE):** thêm scope `all` cho list (HR thấy mọi plan, lọc period/dept/status); `POST /spending-plans/:id/review` `{decision, note}` → APPROVED/REJECTED (note bắt buộc khi reject); gate approve/reject.
**Files (FE):** tab "Chờ duyệt/Tất cả" (HR), sheet chi tiết + nút Duyệt/Từ chối; bảng tổng hợp theo bộ phận/kỳ.
**Acceptance:** chỉ SUBMITTED mới review được; REJECTED → manager sửa & gửi lại (vòng mới); tổng hợp đúng theo kỳ.
**Verify:** integration duyệt/từ chối + RBAC (MANAGER không duyệt được); E2E: gửi→HR duyệt.
**Dep:** Task 2.

## Checkpoint A — Kế hoạch chi end-to-end (manager nhập → HR duyệt)

## Task 4 — Slice: Budget vs Actual
**Objective:** Đối chiếu kế hoạch (APPROVED) vs thực chi (ACTUAL OUT) theo bộ phận & danh mục trong kỳ.
**Files (BE):** `GET /finance/budget-vs-actual?month=&issuingEntityId=` (gate finance:view) → theo dept & category: planned, actual, variance, %used; cảnh báo vượt.
**Files (FE):** trang/section trong Dashboard hoặc trang riêng: bảng kế hoạch vs thực + badge vượt (màu+chữ).
**Acceptance:** planned lấy từ APPROVED plan items kỳ đó; actual từ ACTUAL OUT; variance & %used đúng; lọc pháp nhân.
**Verify:** unit aggregate; E2E seed plan+giao dịch → số khớp.
**Dep:** Task 3.

## Task 5 — Slice: Dự báo dòng tiền + cảnh báo thiếu hụt ⚠️ RISK-FIRST TDD
**Objective:** Số dư dự phóng cuối kỳ + **ngày cạn tiền** + **số tiền thiếu**.
**Files (BE):** `GET /finance/forecast?month=&issuingEntityId=` (finance:view): số dư hiện tại + Σ(PLANNED IN) − (APPROVED plan items theo expectedDate + PLANNED OUT) → đường số dư theo ngày; trả `projectedEndBalance`, `cashOutDate|null`, `shortfall`.
**Files (FE):** banner cảnh báo trên Dashboard ("Đủ chi đến ngày X, sau đó thiếu Y đ") + đường số dư dự phóng (Recharts) + nút gợi ý (đề xuất nạp — chừa hook GĐ3).
**Acceptance:** ghép PLANNED IN + APPROVED plan (theo expectedDate) + PLANNED OUT; xác định ngày số dư < 0 lần đầu + thiếu hụt cuối kỳ; không lẫn ACTUAL của tương lai.
**Verify:** **TDD** nhiều kịch bản (đủ tiền / thiếu giữa kỳ / thiếu cuối kỳ); E2E dashboard banner.
**Dep:** Task 4.

## Checkpoint B — GĐ2 hoàn chỉnh → /test → /review
- [ ] Kế hoạch chi (nhập→duyệt) + Budget vs Actual + Dự báo/cảnh báo chạy end-to-end.
- [ ] RBAC + scope bộ phận + tenant + đa pháp nhân đúng; coverage logic dự báo & scope > 80%.
- [ ] i18n vi+en; design token; tabular-nums; verify browser; 0 regression toàn API.

## Ngoài phạm vi (GĐ3): Đề xuất nạp quỹ + PDF + báo cáo đa pháp nhân; (GĐ4) auto-kéo PR/Payment + tích hợp API.
