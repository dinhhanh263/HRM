# TODO: SPEC-048 — GIAI ĐOẠN 3 ✅ HOÀN THÀNH

> Plan: [048-budget-cash-flow-gd3-plan.md](048-budget-cash-flow-gd3-plan.md)

- [x] **G3-1** — TopUpRequest model + enum + migration + shared types + RBAC (HR create/view/export, Founder approve/reject)
- [x] **G3-2** ⚠️ RISK-FIRST TDD — Đề xuất nạp quỹ: tạo + giải trình tự sinh + Founder duyệt → tự sinh giao dịch IN "Nạp quỹ" + recompute số dư · 3 test
- [x] **G3-3** — Xuất PDF giải trình (pdfkit, Be Vietnam Pro)
- [x] **G3-4** — Báo cáo đa pháp nhân (thu/chi theo tháng/pháp nhân/danh mục) + xuất Excel · 2 test

### ✅ Checkpoint — GĐ3 hoàn chỉnh (verify browser)
- [x] HR tạo đề xuất (giải trình tự động) → Founder duyệt kèm tài khoản → số dư +50M + giao dịch "Nạp quỹ"; PDF tải được; báo cáo + Excel đúng số
- [x] RBAC: HR lập, Founder duyệt (HR không duyệt được 403); recompute nguyên tử
- [x] **1616/1616** test toàn API pass (0 regression); web typecheck sạch

---
**Đã ship GĐ3.** Còn lại GĐ4 (auto-kéo PR/Payment/Payroll vào sổ chi + tích hợp API Ecom/ngân hàng) — plan riêng khi cần.
