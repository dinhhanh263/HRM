# TODO: SPEC-048 — GIAI ĐOẠN 2

> Plan: [048-budget-cash-flow-gd2-plan.md](048-budget-cash-flow-gd2-plan.md)

## Phase 1: Foundation
- [ ] **G2-1** — SpendingPlan/SpendingPlanItem models + enum + migration + shared types + RBAC `spending_plan` (HR + MANAGER)

## Phase 2: Kế hoạch chi
- [ ] **G2-2** ⚠️ scope TDD — MANAGER tạo/sửa/gửi kế hoạch chi bộ phận mình (BE+FE)
- [ ] **G2-3** — HR duyệt/từ chối + tổng hợp toàn công ty

### Checkpoint A: Kế hoạch chi end-to-end (manager nhập → HR duyệt)

## Phase 3: Đối chiếu & dự báo
- [ ] **G2-4** — Budget vs Actual (kế hoạch APPROVED vs thực chi ACTUAL)
- [ ] **G2-5** ⚠️ RISK-FIRST TDD — Dự báo dòng tiền + cảnh báo ngày cạn tiền / thiếu hụt

### Checkpoint B: GĐ2 hoàn chỉnh → /test → /review

---
Thứ tự: G2-1 → G2-2 → G2-3 → G2-4 → G2-5.
