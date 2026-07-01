# TODO: SPEC-048 — GIAI ĐOẠN 2 ✅ HOÀN THÀNH

> Plan: [048-budget-cash-flow-gd2-plan.md](048-budget-cash-flow-gd2-plan.md)

## Phase 1: Foundation
- [x] **G2-1** — SpendingPlan/SpendingPlanItem models + enum + migration + shared types + RBAC `spending_plan` (HR + MANAGER)

## Phase 2: Kế hoạch chi
- [x] **G2-2** ⚠️ scope TDD — MANAGER tạo/sửa/gửi kế hoạch chi bộ phận mình (BE+FE) · 6 test
- [x] **G2-3** — HR duyệt/từ chối + tổng hợp toàn công ty · +1 test

### ✅ Checkpoint A: Kế hoạch chi end-to-end (manager nhập → HR duyệt) — verify browser

## Phase 3: Đối chiếu & dự báo
- [x] **G2-4** — Budget vs Actual (kế hoạch APPROVED vs thực chi ACTUAL) · 2 test
- [x] **G2-5** ⚠️ RISK-FIRST TDD — Dự báo dòng tiền + cảnh báo ngày cạn tiền / thiếu hụt · 2 test

### ✅ Checkpoint B: GĐ2 hoàn chỉnh
- [x] Kế hoạch chi (nhập→duyệt) + Budget vs Actual + Dự báo/cảnh báo end-to-end (verify browser)
- [x] RBAC + scope bộ phận (MANAGER chỉ bộ phận mình, 403 chéo) + tenant + đa pháp nhân
- [x] 11 integration test GĐ2 pass; **1611/1611** test toàn API pass (0 regression); web typecheck sạch
- [x] Cảnh báo "Đủ chi đến ngày X, sau đó thiếu Y đ" hiển thị đúng trên Dashboard

---
**Đã ship GĐ2.** GĐ3 (đề xuất nạp quỹ + PDF trình Founder + báo cáo đa pháp nhân) — plan riêng khi cần.
