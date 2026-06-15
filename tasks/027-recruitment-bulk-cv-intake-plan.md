# Plan — SPEC-027: Recruitment Bulk CV Intake (CV-First)

> Vertical slices, foundation-first. Mỗi slice đi xuyên DB → service → API → (test),
> frontend gom cuối. Spec: [027-recruitment-bulk-cv-intake.md](../docs/specs/027-recruitment-bulk-cv-intake.md)

## Context từ khảo sát code (đã verify)

| Thành phần | Đường dẫn | Ghi chú tái dùng |
|------------|-----------|------------------|
| Routes ATS | `apps/api/src/app/routes/v1/recruitment.routes.ts` | Pattern: `authenticate` → `requirePermission` → `validate` → controller. Thêm routes bulk-import vào đây. |
| Upload middleware | `apps/api/src/app/middlewares/cv-upload.middleware.ts` | Có `uploadCvFile()` (multer single). Thêm `uploadCvFiles()` (`.array('files', 50)`), cùng `CV_ALLOWED_MIME`/`CV_MAX_FILE_BYTES`. |
| Storage | `apps/api/src/infrastructure/storage/cv-storage.ts` | `storeCvFile()`, `resolveCvDiskPath()`. Tái dùng nguyên. |
| Text extract | `apps/api/src/domain/recruitment/cv-text-extract.ts` | `extractCvText(buffer, mime)` → `{ text, hasText }`. |
| Parser | `apps/api/src/domain/recruitment/resume-parser.ts`, `haiku-resume-parser.ts` | `getResumeParser()`, `parsedResumeSchema`. |
| Queue | `apps/api/src/domain/recruitment/cv-parse.queue.ts` | `CvParseJobData` hiện chỉ có `{attachmentId, candidateId, tenantId}` → **mở rộng thành union** thêm nhánh bulk item. |
| Worker | `apps/api/src/domain/recruitment/cv-parse.worker.ts` | `handleCvParseJob` → **phân nhánh** theo `job.data` (attachment vs bulk item). Bootstrap ở `apps/api/src/server.ts` (`createCvParseWorker`). |
| Attachment service | `apps/api/src/domain/services/candidate-attachment.service.ts` | Mẫu cho upload→extract→create→enqueue. |
| Candidate service | `apps/api/src/domain/services/candidate.service.ts` | `create(tenantId, input)` — `force:true` bỏ qua fuzzy-name; **vẫn** hard-block email/phone (ConflictError `CANDIDATE_DUPLICATE_EMAIL/PHONE`). Dùng `candidateRepository.findByEmail/findByPhone`, `normalizeName`, `normalizePhone`. |
| Application service | `apps/api/src/domain/services/application.service.ts` | `create(tenantId, userId, {candidateId, jobId, source})` — tự chọn `job.stages[0]` (stage đầu), throw `APPLICATION_DUPLICATE_ACTIVE` nếu đã có active. **Cần `userId` của HR có Employee profile** (`employeeRepository.findByUserId`). |
| RBAC catalog | `packages/shared/src/types/rbac.ts` | Mảng `recruitment[]` — thêm `'bulk_import'`. |
| RBAC roles | `apps/api/src/domain/rbac/catalog.ts` | Thêm `'recruitment:bulk_import'` vào HR_MANAGER. SUPER_ADMIN wildcard. Re-seed qua `seedPermissionCatalog` + `syncSystemRolesForTenant`. |
| FE wizard mẫu | `apps/web/src/features/assets/components/AssetImportWizard.tsx`, `apps/web/src/features/employees/components/EmployeeImportWizard.tsx` | Mirror cấu trúc step + hooks (`useAssetImport.ts`). |
| FE job detail | `apps/web/src/features/recruitment/pages/JobDetailPage.tsx` | Gắn nút "Nhập CV hàng loạt" (qua `<Can>`). |
| FE recruitment hooks | `apps/web/src/features/recruitment/hooks/useCandidateAttachments.ts` | Mẫu polling `refetchInterval` khi còn `PARSING`. |

### Quyết định kỹ thuật chốt từ code (giải Open Questions của spec)
- **OQ#1 — worker:** phân nhánh trong worker hiện tại (giữ 1 connection + concurrency=2). `CvParseJobData` thành discriminated union (`kind: 'attachment' | 'bulk_item'`).
- **OQ#2 — LINK_EXISTING khi đã có active application:** `applicationService.create` throw `APPLICATION_DUPLICATE_ACTIVE` → **bắt lỗi này, coi là thành công "đã có hồ sơ"**, chỉ gắn CV (không tạo application trùng). Báo ở summary là `linkedExisting`.
- **OQ#4 — stage đầu:** dùng `job.stages[0]` như `applicationService.create` đã làm; nếu job không có stage → item `FAILED` lý do `JOB_NO_STAGES` (không vỡ cả batch).
- **Confirm dedup race:** NEW gặp `CANDIDATE_DUPLICATE_EMAIL/PHONE` lúc tạo → tự tra candidate theo email/phone, chuyển sang LINK_EXISTING, ghi vào summary.

---

## Foundation (làm trước, không thể tránh)

### Task 0.1 — Prisma models + migration + RBAC permission
**Files:**
- `apps/api/prisma/schema.prisma` (thêm `BulkImportBatch`, `BulkImportItem`, enums `BulkImportStatus`, `BulkImportItemStatus`, `BulkImportItemResolution`; thêm relation `bulkImportBatches BulkImportBatch[]` vào `Job`)
- `apps/api/prisma/migrations/**` (qua `prisma migrate dev --name bulk_cv_intake`)
- `packages/shared/src/types/rbac.ts` (thêm `'bulk_import'` vào `recruitment`)
- `apps/api/src/domain/rbac/catalog.ts` (thêm `'recruitment:bulk_import'` vào HR_MANAGER)
- Shared DTO types: `packages/shared/src/types/recruitment.ts` (thêm `BulkImportBatchDto`, `BulkImportItemDto`, request/response shapes, enums)

**Acceptance:**
- [ ] Migration chạy được; bảng `bulk_import_batches`, `bulk_import_items` tạo đúng (snake_case `@@map`, index `[tenantId, jobId]`, `[batchId]`, FK cascade từ item → batch)
- [ ] `PermissionKey` union build có `recruitment:bulk_import`; `tsc` xanh ở `packages/shared`
- [ ] Re-seed (script seed/sync) cấp `recruitment:bulk_import` cho SUPER_ADMIN + HR_MANAGER, KHÔNG cấp cho MANAGER/EMPLOYEE
- [ ] `reviewedData`/`parsedData` kiểu `Json?`; `rawCvText String? @db.Text`

**Dependencies:** none. **Verify:** `prisma validate` + migrate + `tsc`.

---

## Phase 1: Upload & Parse (CV-first intake)

### Task 1.1 — Bulk upload endpoint (batch + items + file lưu + enqueue)
**Vertical:** DB + service + API.
**Files:**
- `apps/api/src/app/middlewares/cv-upload.middleware.ts` (thêm `uploadCvFiles()`)
- `apps/api/src/domain/repositories/bulk-import.repository.ts` (mới: create batch, createMany items, findByIdScoped, listItems, updateItem, ...)
- `apps/api/src/domain/services/bulk-import.service.ts` (mới: `uploadBatch(tenantId, jobId, files[])`)
- `apps/api/src/app/controllers/bulk-import.controller.ts` (mới: `upload`)
- `apps/api/src/app/validators/recruitment.validator.ts` (params/file guards)
- `apps/api/src/app/routes/v1/recruitment.routes.ts` (`POST /jobs/:jobId/bulk-import`)

**Acceptance:**
- [ ] Nhận ≤ 50 file PDF/DOCX ≤ 10MB; file sai mime/size bị loại riêng (không vỡ cả request)
- [ ] Mỗi file hợp lệ: `storeCvFile` → `extractCvText` (sync) → tạo `BulkImportItem` (status `PARSING`, lưu `fileUrl`, `fileName`, `mimeType`, `rawCvText` nếu có) → `enqueueCvParse({kind:'bulk_item', ...})`
- [ ] Tạo `BulkImportBatch(status DRAFT, jobId, createdById, totalItems)`; job phải thuộc tenant và không `CANCELLED`/`CLOSED`
- [ ] Trả `{ batchId, items[] }`; guard `recruitment:bulk_import`, tenant-scoped
- [ ] Enqueue lỗi không làm vỡ upload (try/catch + log như attachment service)

**Dependencies:** 0.1. **Verify:** integration — upload 3 file (1 sai mime) → 1 batch + 2 item, 2 file trên disk, 2 job enqueued.

### Task 1.2 — Worker branch: parse bulk item
**Files:**
- `apps/api/src/domain/recruitment/cv-parse.queue.ts` (`CvParseJobData` → union `{kind:'attachment',...} | {kind:'bulk_item', itemId, batchId, tenantId}`)
- `apps/api/src/domain/recruitment/cv-parse.worker.ts` (phân nhánh `handleCvParseJob`)
- `apps/api/src/domain/repositories/bulk-import.repository.ts` (`markItemParsing/Parsed/ParseFailed`)
- `apps/api/src/domain/services/bulk-import.service.ts` (logic ghi parsedData→reviewedData, fallback filename)

**Acceptance:**
- [ ] Job `bulk_item`: đọc file → `extractCvText` → `getResumeParser().parse()` → set `parsedData`, copy sang `reviewedData`, `parseStatus=DONE`, `status=PARSED`, `parserProvider`
- [ ] Không có text / parse lỗi → `parseStatus=FAILED`, `status=PARSE_FAILED`, `reviewedData.fullName` = filename (bỏ đuôi), field khác trống — **upload/worker không throw qua boundary**
- [ ] Nhánh `attachment` cũ giữ nguyên hành vi (regression)
- [ ] Không log nội dung CV
- [ ] Sau parse, gọi soft-dedup (Task 1.3) để set cờ + resolution mặc định

**Dependencies:** 1.1. **Verify:** unit (parse DONE/FAILED, fallback) + integration với heuristic parser (không cần ANTHROPIC key).

### Task 1.3 — Soft dedup (đánh cờ, không chặn)
**Files:**
- `apps/api/src/domain/services/bulk-import.service.ts` (`computeDedup(item, tenantId, batchItems)`)
- (tái dùng `candidateRepository.findByEmail/findByPhone/findNameCandidates`, `normalizeName`, `normalizePhone`)

**Acceptance:**
- [ ] Email (lowercased) / phone (E.164) match candidate hiện có → `duplicateOfCandidateId` + `duplicateReason` (`EMAIL`/`PHONE`), `resolution=LINK_EXISTING`
- [ ] Tên không dấu match → `duplicateReason=NAME` (cảnh báo yếu, mặc định vẫn `NEW`)
- [ ] Trùng trong cùng batch (2 item cùng email/phone) → đánh dấu để HR xử lý
- [ ] Không trùng → `resolution=NEW`

**Dependencies:** 1.2. **Verify:** unit cho từng nhánh (có dấu/không dấu, email/phone/intra-batch).

---
## Checkpoint A: Intake hoạt động
- [ ] Upload N CV → batch + items, file lưu, parse chạy nền, dedup gắn cờ
- [ ] Nhánh attachment cũ không hồi quy; worker không bao giờ mất state recoverable

---

## Phase 2: Review & Confirm

### Task 2.1 — GET batch + PATCH item + DELETE batch
**Files:**
- `apps/api/src/domain/services/bulk-import.service.ts` (`getBatch`, `updateItem`, `cancelBatch`)
- `apps/api/src/app/controllers/bulk-import.controller.ts` (`getBatch`, `updateItem`, `cancel`)
- `apps/api/src/app/validators/recruitment.validator.ts` (`updateBulkItemSchema`: reviewedData fields + resolution enum)
- routes: `GET /bulk-import/:batchId`, `PATCH /bulk-import/:batchId/items/:itemId`, `DELETE /bulk-import/:batchId`

**Acceptance:**
- [ ] `GET` trả batch + items (parsed/reviewed, parseStatus, cờ trùng, resolution); tenant-scoped
- [ ] `PATCH` sửa `reviewedData` (validate qua candidate-like schema) hoặc đổi `resolution` (NEW/LINK_EXISTING/SKIP); item lỗi validate báo inline (không lưu)
- [ ] Batch chuyển `DRAFT→REVIEWING` khi hết item `PARSING`
- [ ] `DELETE` xoá items + file trên disk (cleanup), batch `CANCELLED`
- [ ] Guard `recruitment:bulk_import`

**Dependencies:** 1.3. **Verify:** integration GET/PATCH/DELETE + 403 cho role khác.

### Task 2.2 — Confirm (commit per-item)
**Files:**
- `apps/api/src/domain/services/bulk-import.service.ts` (`confirm(tenantId, userId, batchId)`)
- `apps/api/src/app/controllers/bulk-import.controller.ts` (`confirm`)
- route: `POST /bulk-import/:batchId/confirm`
- (tái dùng `candidateService.create`, `applicationService.create`, `candidateAttachmentRepository.create`)

**Acceptance:**
- [ ] Chỉ chạy khi `REVIEWING` & không còn `PARSING`; bỏ qua item `SKIP`
- [ ] Mỗi item trong **transaction riêng**:
  - `NEW`: `candidateService.create(force:true)` → tạo `CandidateAttachment` (trỏ `fileUrl` đã lưu, `parsedData`, `parseStatus=DONE`) + cập nhật `rawCvText` → `applicationService.create` (stage đầu) → set `candidateId`/`applicationId`, `status=CONFIRMED`
  - `LINK_EXISTING`: gắn attachment vào `duplicateOfCandidateId`; tạo application nếu chưa có active (bắt `APPLICATION_DUPLICATE_ACTIVE` → coi là linked, không lỗi)
- [ ] **Race**: NEW gặp `CANDIDATE_DUPLICATE_EMAIL/PHONE` → tra candidate, chuyển LINK_EXISTING, ghi summary
- [ ] Item lỗi → `status=FAILED` + `failureReason`, **tiếp tục** item khác
- [ ] Batch `CONFIRMED` + `confirmedAt`; trả `{ createdCandidates, linkedExisting, applicationsCreated, skipped, failed[] }`

**Dependencies:** 2.1. **Verify:** integration happy path (NEW→candidate+application stage đầu; LINK→0 candidate mới); per-item isolation (1 lỗi không rollback toàn bộ); dedup race.

---
## Checkpoint B: Backend hoàn chỉnh
- [ ] Upload → parse → review → confirm chạy end-to-end qua API
- [ ] RBAC + tenant isolation pass; per-item isolation pass; coverage critical path

---

## Phase 3: Frontend

### Task 3.1 — Hooks TanStack Query
**Files:** `apps/web/src/features/recruitment/hooks/useBulkImport.ts` (mới)
- `useBulkImportUpload(jobId)`, `useBulkImportBatch(batchId)` (poll khi còn PARSING), `useUpdateBulkImportItem`, `useConfirmBulkImport`, `useCancelBulkImport`
**Acceptance:** mirror `useCandidateAttachments` polling + `useAssetImport` mutation pattern; invalidate `candidateKeys` + application/pipeline queries của job sau confirm.
**Dependencies:** 2.2.

### Task 3.2 — Bulk import wizard + review table
**Files:**
- `apps/web/src/features/recruitment/components/BulkCvImportWizard.tsx` (mới)
- `apps/web/src/features/recruitment/pages/JobDetailPage.tsx` (nút "Nhập CV hàng loạt" qua `<Can permission="recruitment:bulk_import">`)
- i18n: `apps/web/src/i18n/locales/{vi,en}/recruitmentBulkImport.json` (mới)
**Acceptance:**
- [ ] Step: (1) kéo-thả nhiều CV → (2) parse progress (skeleton + poll) → (3) dense review table (tên/email/phone/skills/cờ trùng/resolution; sửa inline; toggle loại) → (4) confirm → (5) summary
- [ ] Dense table theo `ui-modern.md`: sticky header, skeleton, empty/error, `tabular-nums`; chỉ design token; light+dark; vi+en
- [ ] Confirm thành công → toast + invalidate + đóng wizard
**Dependencies:** 3.1.

---
## Checkpoint C: Feature hoàn chỉnh
- [ ] E2E Playwright pass (gồm CV scan ảnh fallback + dòng trùng + loại dòng rác)
- [ ] Light/dark, vi/en, a11y (keyboard, aria, focus); pipeline job tăng đúng số application
- [ ] `/test` → `/review` trước khi ship

## Risks
- Upload 50×10MB ~500MB/request → kiểm body/proxy limit (OQ#5); cân nhắc chunk client nếu timeout
- Haiku rate-limit khi batch lớn (concurrency=2 giữ an toàn)
- File rác khi batch bị bỏ quên → cân nhắc TTL cleanup (OQ#3, có thể để iteration sau)
