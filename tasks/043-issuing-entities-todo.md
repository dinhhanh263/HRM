# TODO: SPEC-043 Issuing Entities (Pháp nhân phát hành)

> Spec: [docs/specs/043-issuing-entities.md](../docs/specs/043-issuing-entities.md) · mở rộng SPEC-042 (PO PDF)

## Phase 0 — Backend foundation
- [x] 0.1 Prisma: model `IssuingEntity` + 6 cột snapshot trên `PurchaseRequest` + back-relations + migration `20260624070745_issuing_entities` (+ backfill default từ `settings.company`)
- [x] 0.2 Shared types `IssuingEntityDto` + Create/Update + bổ sung `issuingEntityId` + `issuing*` vào PurchaseRequestDto/Create/Update
- [x] 0.3 Storage config `entity-logo` (PNG/JPEG ≤2MB) + multer middleware (chỉ PNG/JPEG)

## Phase 1 — Backend feature
- [x] 1.1 `issuing-entity.service.ts` + repository (tenant-scope, chỉ 1 isDefault, active) · routes `/api/v1/issuing-entities` (CRUD + logo upload/delete/serve) gate settings:view/update · **TDD: set-default đơn nhất, tenant scope**
- [x] 1.2 PR service: resolve + **snapshot** entity vào phiếu khi create/update/resubmit · validator nhận `issuingEntityId` · **TDD snapshot + fallback + reject cross-tenant**
- [x] 1.3 `po.pdf.ts`: header từ snapshot phiếu + nhúng logo (`doc.image`, đọc storage, try/catch); fallback `settings.company`

### ✅ Checkpoint A: migrate+backfill sạch · API CRUD + PR snapshot + PDF logo — DONE (63 test pass)

## Phase 2 — Frontend
- [x] 2.1 Settings: section "Đơn vị phát hành" (list card + Sheet form + logo uploader + set default + ẩn) + hooks + i18n settings.*
- [x] 2.2 PR form: dropdown "Đơn vị phát hành" (mặc định default) + types/hooks; Detail hiển thị pháp nhân; i18n purchase.form.issuingEntity

### ✅ Checkpoint B: VERIFIED — backfill CodeCrush + thêm Hale + upload logo → tạo PR chọn Hale → PDF in header+logo+MST Hale (8.164.800 ₫); dropdown mặc định; logo thumbnail trong Cài đặt

## Phase 3 — Review
- [x] 3.1 `/review` five-axis: **APPROVE, 0 Critical**. Fix: (#1) sniff magic-byte PNG/JPEG server-side, (#2) scope tenantId vào update, (#5) xóa dead code. i18n parity OK · RBAC OK · fallback không phá phiếu cũ.
  - Follow-up đã ghi nhận (chấp nhận/để sau): snapshot logo theo URL (thay/xóa logo ảnh hưởng PDF cũ); thêm partial-unique index cho isDefault; backfill idempotent; ẩn `issuingLogoUrl` khỏi DTO; edit PR khi entity đã ẩn

### ✅ Checkpoint G (Ship) — READY
