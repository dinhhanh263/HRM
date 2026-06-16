# TODO: SPEC-039 — CV Storage trên GCS

> Plan: [039-cv-storage-gcs-plan.md](039-cv-storage-gcs-plan.md) · Spec: [docs/specs/039-cv-storage-gcs.md](../docs/specs/039-cv-storage-gcs.md)

## Phase 1: Foundation (local driver, no behavior change)
- [x] 1.1 — Interface `CvStorageDriver` + `StoredFile` (bỏ `diskPath`) → `cv-storage.types.ts`
- [x] 1.2 — `local-cv-storage.ts` (store/read/createReadStream/remove) + unit test (round-trip, traversal, remove-missing)
- [x] 1.3 — `cv-storage.ts` thành selector/facade theo `STORAGE_DRIVER` (default local); bỏ `resolveCvDiskPath`
- [x] 1.4 — `cv-parse.worker.ts` + `bulk-import.service.ts` dùng `readCvFile()`, bỏ `node:fs`
- [x] 1.5 — `candidate-attachment.service.getDownload` → `{stream,contentType,fileName}`; `candidate.controller` pipe + headers

### ✅ Checkpoint: Foundation — ĐẠT
- [x] `grep -r resolveCvDiskPath apps/api/src` = 0
- [x] Suite tuyển dụng + bulk CV + worker (13 file, 140 test) xanh (local); E2E để dành cho /test cuối
- [x] `pnpm --filter @hrm/api typecheck` sạch

## Phase 2: GCS driver
- [x] 2.1 — Cài `@google-cloud/storage` (7.21.0) + config `GCS_BUCKET`/`GCP_PROJECT_ID`
- [x] 2.2 — `gcs-cv-storage.ts` (ADC, map key `cv/<uuid>`, ignoreNotFound) + fail-fast khi thiếu bucket; tách `cv-mime.ts` dùng chung
- [x] 2.3 — Unit test GCS driver (mock, 7 test) + test selector default local

### ✅ Checkpoint: GCS Driver — ĐẠT
- [x] Unit test driver + selector xanh (11 test); local không hồi quy

## Phase 3: Cấu hình & secret
- [x] 3.1 — `.env.example`: thêm `STORAGE_DRIVER/GCS_BUCKET/GCP_PROJECT_ID` + comment ADC; `RESEND_API_KEY` → rỗng
- [x] 3.2 — Mục "Triển khai production" trong spec: bucket private + Workload Identity + region + lifecycle

### ✅ Checkpoint: Done — ĐẠT
- [x] Tất cả test xanh với `STORAGE_DRIVER=local` (14 file, 147 test) · typecheck sạch
- [x] GCS driver test (mock) xanh — sẵn sàng bật `gcs` ở prod
- [x] Không secret thật trong `.env.example`
- [ ] (Ngoài code, khi deploy) Rotate Resend key · tạo bucket + IAM/Workload Identity
- [x] (/test) E2E `recruitment-critical-path` xanh (upload CV → store → worker parse, full browser)
- [x] (/test) Thêm test round-trip nhị phân download (assert bytes khớp + content-type), không chỉ status 200
- [x] (/test) Full API suite: 98 file / 1268 test pass — no regression

## Review (/review) — fixes applied
- [x] 🟡 `selectDriver` validate: throw khi STORAGE_DRIVER lạ (chống typo âm thầm về local) + test hành vi
- [x] 🟡 Log stream error trong `downloadAttachment` (không nuốt im lặng)
- [x] Re-verify: typecheck sạch + storage unit/download integration xanh
