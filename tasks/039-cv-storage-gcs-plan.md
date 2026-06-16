# Plan: SPEC-039 — CV Storage trên GCS

> Spec: [docs/specs/039-cv-storage-gcs.md](../docs/specs/039-cv-storage-gcs.md)
> Chiến lược: refactor an toàn (local driver giữ nguyên hành vi) → thêm GCS driver → vệ sinh cấu hình/secret.
> Mỗi phase kết thúc ở trạng thái **xanh** (test pass), có thể dừng/ship được.

## Bối cảnh & ràng buộc

- Abstraction hiện rò: 3 nơi gọi `resolveCvDiskPath()` rồi tự `fs.readFile`/`res.download`.
  Phải đóng kín trước khi GCS vào được (object storage không có "disk path").
- `fileUrl` (`/uploads/cv/<uuid>.<ext>`) đã lưu trong DB (`candidate_attachments`, `cv_import_items`)
  → **giữ nguyên format**, zero migration.
- Upload là `multer.memoryStorage()` → caller luôn có `buffer`. Không đổi.
- Default `local` để dev/CI không cần GCS credentials. Prod set `STORAGE_DRIVER=gcs`.

## Call sites phải đổi (nguồn chuẩn)

| File | Hiện tại | Sau |
|---|---|---|
| `infrastructure/storage/cv-storage.ts` | 3 hàm + `diskPath` leak | selector + facade `storeCvFile/readCvFile/createCvReadStream/deleteCvFile` |
| `domain/recruitment/cv-parse.worker.ts:54` | `resolveCvDiskPath`+`readFile` | `readCvFile(fileUrl)` |
| `domain/services/bulk-import.service.ts:114/182/224` | `storeCvFile`/`deleteCvFile`/`resolveCvDiskPath`+`readFile` | `storeCvFile`/`deleteCvFile`/`readCvFile` |
| `domain/services/candidate-attachment.service.ts:68/126` | `storeCvFile`/`getDownload→{diskPath}` | `storeCvFile`/`getDownload→{stream,contentType,fileName}` |
| `app/controllers/candidate.controller.ts` | `res.download(diskPath)` | `.pipe(res)` + headers |

---

## Phase 1 — Foundation: interface + local driver + đóng kín caller (local, no behavior change)

### Task 1.1 — Định nghĩa interface + types
**Objective**: Hợp đồng driver chung, bỏ `diskPath` khỏi public type.
**Files**: `apps/api/src/infrastructure/storage/cv-storage.types.ts` (mới)
**Acceptance**:
- [ ] `interface CvStorageDriver { store, read, createReadStream, remove }` đủ chữ ký như spec §1.
- [ ] `StoredFile = { fileUrl: string }` (bỏ `diskPath`).
**Deps**: —

### Task 1.2 — Local driver
**Objective**: Bê logic đĩa hiện tại vào 1 impl, giữ chống traversal.
**Files**: `apps/api/src/infrastructure/storage/local-cv-storage.ts` (mới)
**Acceptance**:
- [ ] `store` ghi UUID vào `CV_STORAGE_DIR`; `read`/`createReadStream`/`remove` đúng hành vi cũ.
- [ ] `remove` nuốt `ENOENT`; resolve filename từ `fileUrl` chặn `/` và `..`.
- [ ] Unit test round-trip + traversal + remove-missing.
**Deps**: 1.1

### Task 1.3 — Selector/facade thay `cv-storage.ts`
**Objective**: Chọn driver theo `STORAGE_DRIVER` (default local), export facade cũ.
**Files**: `apps/api/src/infrastructure/storage/cv-storage.ts` (viết lại), `shared/configs/cv.config.ts` (thêm `STORAGE_DRIVER`)
**Acceptance**:
- [ ] Export `storeCvFile/readCvFile/createCvReadStream/deleteCvFile`.
- [ ] Không set env → local. (`gcs` xử lý ở Phase 2.)
- [ ] **Không còn export `resolveCvDiskPath`.**
**Deps**: 1.2

### Task 1.4 — Đổi worker + bulk-import sang `readCvFile`
**Objective**: Bỏ `fs.readFile`/`resolveCvDiskPath` ở tầng đọc-để-parse.
**Files**: `domain/recruitment/cv-parse.worker.ts`, `domain/services/bulk-import.service.ts`
**Acceptance**:
- [ ] Cả 2 dùng `readCvFile(fileUrl)` lấy buffer; bỏ import `node:fs`.
- [ ] `bulk-import` cancel vẫn gọi `deleteCvFile`.
**Deps**: 1.3

### Task 1.5 — Đổi download sang stream
**Objective**: Tải CV qua stream thay vì sendFile, giữ RBAC.
**Files**: `domain/services/candidate-attachment.service.ts` (`getDownload` trả `{stream,contentType,fileName}`), `app/controllers/candidate.controller.ts` (pipe + `Content-Type`/`Content-Disposition`)
**Acceptance**:
- [ ] HR có `recruitment:candidate_view` tải đúng nội dung + content-type; thiếu quyền → 403.
- [ ] Integration test stream nội dung khớp.
**Deps**: 1.3

---
## Checkpoint: Foundation Complete (local driver)
- [ ] `STORAGE_DRIVER` unset → mọi luồng CV chạy như cũ.
- [ ] `grep -r resolveCvDiskPath apps/api/src` → **0 kết quả**.
- [ ] Suite tuyển dụng + bulk CV + worker + E2E `recruitment-critical-path` **xanh**.
- [ ] `pnpm --filter @hrm/api typecheck` sạch.
---

## Phase 2 — GCS driver (production)

### Task 2.1 — Thêm dependency + config GCS
**Objective**: Cài SDK, khai báo env config.
**Files**: `apps/api/package.json` (`@google-cloud/storage`), `shared/configs/cv.config.ts` (`GCS_BUCKET`, `GCP_PROJECT_ID`)
**Acceptance**:
- [ ] `pnpm install` ok; license Apache-2.0.
**Deps**: 1.3

### Task 2.2 — GCS driver impl + fail-fast
**Objective**: Impl driver dùng ADC; lỗi cấu hình rõ khi thiếu bucket.
**Files**: `apps/api/src/infrastructure/storage/gcs-cv-storage.ts` (mới), `cv-storage.ts` (nhánh `gcs`)
**Acceptance**:
- [ ] `store/read/createReadStream/remove` map `fileUrl ↔ key=cv/<uuid>` đúng; `remove` `ignoreNotFound`.
- [ ] `STORAGE_DRIVER=gcs` thiếu `GCS_BUCKET` → throw lúc init.
- [ ] Auth qua ADC, **không** đọc access key tĩnh.
**Deps**: 2.1

### Task 2.3 — Unit test GCS driver (mock)
**Objective**: Chứng minh gọi đúng API GCS, không cần bucket thật.
**Files**: `apps/api/tests/unit/storage/gcs-cv-storage.test.ts` (mới)
**Acceptance**:
- [ ] Mock `@google-cloud/storage`; assert `save/download/createReadStream/delete` + map key.
- [ ] Test selector: default local; `gcs` thiếu bucket → throw.
**Deps**: 2.2

---
## Checkpoint: GCS Driver Complete
- [ ] Unit test driver + selector xanh; local vẫn xanh (không hồi quy).
---

## Phase 3 — Cấu hình & vệ sinh secret

### Task 3.1 — Cập nhật `.env.example` + rotate placeholder
**Objective**: Tài liệu env + xoá secret thật đã lộ.
**Files**: `apps/api/.env.example`
**Acceptance**:
- [ ] Thêm `STORAGE_DRIVER`, `GCS_BUCKET`, `GCP_PROJECT_ID` + comment ADC (local vs gcs).
- [ ] `RESEND_API_KEY` thật → placeholder `re_xxx`. (Rotate key trên Resend là thao tác ngoài code — ghi nhắc.)
**Deps**: 2.1

### Task 3.2 — Ghi chú deploy (bucket/IAM/lifecycle)
**Objective**: Nối với checklist deploy production.
**Files**: `docs/specs/039-cv-storage-gcs.md` (mục triển khai) hoặc README deploy
**Acceptance**:
- [ ] Ghi: bucket private (uniform access), SA + Workload Identity, region cùng compute, lifecycle retention CV (out-of-code).
**Deps**: —

---
## Checkpoint: Done
- [ ] Toàn bộ unit/integration/E2E xanh với `STORAGE_DRIVER=local`.
- [ ] GCS driver có test (mock). Sẵn sàng bật `gcs` ở prod.
- [ ] Không secret thật trong repo.
- [ ] (Ngoài code) Rotate Resend key + tạo bucket/IAM khi deploy.
---

## Thứ tự & rủi ro
1. **Phase 1 là rủi ro nhất** (đụng 3 service + worker + controller) → làm trước, giữ local xanh = an toàn rollback.
2. Phase 2 cô lập trong driver mới → rủi ro thấp.
3. Phase 3 thuần cấu hình/tài liệu.

## Không làm trong plan này
Signed URL · migrate CV cũ · lifecycle automation bằng IaC · storage cho file khác (avatar/excel) · CMEK.
