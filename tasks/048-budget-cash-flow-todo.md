# TODO: SPEC-048 Ngân sách & Dòng tiền — GIAI ĐOẠN 1 (MVP) ✅ HOÀN THÀNH

> Plan: [048-budget-cash-flow-plan.md](048-budget-cash-flow-plan.md) · Spec: [../docs/specs/048-budget-cash-flow.md](../docs/specs/048-budget-cash-flow.md)

## Phase 1: Foundation
- [x] **Task 1** — Prisma models (FundAccount, FinanceCategory, CashTransaction + 5 enum) + migration + shared DTO types (`@hrm/shared`) + RBAC catalog (`finance`, `fund_account`, `cash_transaction`) + gán HR_MANAGER + seed rbac

### ✅ Checkpoint: build + migrate + seed rbac sạch, types dùng được 2 app

## Phase 2: Master data (vertical slices)
- [x] **Task 2** — Tài khoản quỹ CRUD (BE + FE), số dư = openingBalance, lọc theo pháp nhân · 6 test
- [x] **Task 3** — Danh mục thu/chi phân cấp + seed mặc định VN · 5 test

### ✅ Checkpoint A: Master data sẵn sàng (RBAC + tenant + đa pháp nhân + test)

## Phase 3: Sổ giao dịch (lõi)
- [x] **Task 4** ⚠️ RISK-FIRST — Giao dịch IN/OUT nhập tay + **recompute số dư nguyên tử** + list/filter/tổng (TDD) · 6 test
- [x] **Task 5** — Import Excel/CSV giao dịch (template → parse stateless → preview → confirm) · 3 test

### ✅ Checkpoint B: Nhập tay + import đều đúng, số dư luôn khớp

## Phase 4: Tổng quan
- [x] **Task 6** — Dashboard Dòng tiền (KPI + biểu đồ in/out + chi theo danh mục, chọn pháp nhân/kỳ) · 2 test

### ✅ Checkpoint C: MVP hoàn chỉnh
- [x] 3 màn (Tài khoản, Sổ giao dịch, Dashboard) + Danh mục + Import chạy end-to-end (verify qua browser)
- [x] RBAC server-side + tenant + đa pháp nhân đúng ở mọi endpoint
- [x] i18n vi+en đủ; design token (no hex); tabular-nums cho số
- [x] 22 integration test finance pass; **1600/1600** test toàn API pass (0 regression); web typecheck sạch

---
**Đã ship GĐ1.** Bước tiếp (GĐ2): kế hoạch chi theo bộ phận + Budget vs Actual + Dự báo/cảnh báo thiếu hụt → plan riêng.
