# TODO — SPEC-027: Recruitment Bulk CV Intake

> Plan: [027-recruitment-bulk-cv-intake-plan.md](027-recruitment-bulk-cv-intake-plan.md)

## Foundation
- [x] 0.1 — Prisma models (`BulkImportBatch`/`BulkImportItem` + enums) + migration + RBAC `recruitment:bulk_import` + shared DTOs

## Phase 1: Upload & Parse
- [x] 1.1 — `POST /jobs/:jobId/bulk-import`: multer array, store files, create batch+items, enqueue
- [x] 1.2 — Worker branch `bulk_item`: parse → parsedData/reviewedData, fallback filename
- [x] 1.3 — Soft dedup: email/phone/name + intra-batch, set resolution mặc định

## Checkpoint A: Intake hoạt động

## Phase 2: Review & Confirm
- [x] 2.1 — `GET` batch + `PATCH` item (edit/resolution/skip) + `DELETE` batch (cleanup file)
- [x] 2.2 — `POST .../confirm`: commit per-item (NEW/LINK_EXISTING), dedup race, isolation, summary

## Checkpoint B: Backend hoàn chỉnh

## Phase 3: Frontend
- [x] 3.1 — Hooks `useBulkImport` (upload/poll/update/confirm/cancel)
- [x] 3.2 — `BulkCvImportWizard` + nút trên JobDetailPage + i18n vi/en

## Checkpoint C: Feature hoàn chỉnh → /test → /review → Ship
- [x] /test — 24 integration test xanh (upload, RBAC 403, parse worker, filename fallback, dedup, confirm NEW/LINK_EXISTING/isolation/race/SKIP/double-submit); tsc api+web sạch
- [x] /review — five-axis: SHIP WITH NITS; đã vá H1 (double-confirm tạo trùng candidate/application) bằng atomic claim REVIEWING→CONFIRMED + test idempotency
