# TODO: SPEC-048 Ngân sách & Dòng tiền — GIAI ĐOẠN 1 (MVP)

> Plan: [048-budget-cash-flow-plan.md](048-budget-cash-flow-plan.md) · Spec: [../docs/specs/048-budget-cash-flow.md](../docs/specs/048-budget-cash-flow.md)

## Phase 1: Foundation
- [ ] **Task 1** — Prisma models (FundAccount, FinanceCategory, CashTransaction + 5 enum) + migration + shared DTO types (`@hrm/shared`) + RBAC catalog (`finance`, `fund_account`, `cash_transaction`) + gán HR_MANAGER + seed rbac

### Checkpoint: build + migrate + seed rbac sạch, types dùng được 2 app

## Phase 2: Master data (vertical slices)
- [ ] **Task 2** — Tài khoản quỹ CRUD (BE + FE), số dư = openingBalance, lọc theo pháp nhân
- [ ] **Task 3** — Danh mục thu/chi phân cấp + seed mặc định VN

### Checkpoint A: Master data sẵn sàng (RBAC + tenant + đa pháp nhân + test)

## Phase 3: Sổ giao dịch (lõi)
- [ ] **Task 4** ⚠️ RISK-FIRST — Giao dịch IN/OUT nhập tay + **recompute số dư nguyên tử** + list/filter/tổng (TDD trước)
- [ ] **Task 5** — Import Excel/CSV giao dịch (template → parse stateless → preview → confirm)

### Checkpoint B: Nhập tay + import đều đúng, số dư luôn khớp, coverage > 80%

## Phase 4: Tổng quan
- [ ] **Task 6** — Dashboard Dòng tiền (KPI + biểu đồ in/out + chi theo danh mục, chọn pháp nhân/kỳ)

### Checkpoint C: MVP hoàn chỉnh → sẵn sàng /test → /review → Ship

---
**Thứ tự phụ thuộc:** 1 → 2,3 → 4 → 5 → 6. Task 4 là rủi ro nhất (logic số dư) — làm TDD, ưu tiên sớm ngay sau master data.
