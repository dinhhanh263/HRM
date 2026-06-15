# SPEC-027: Recruitment Bulk CV Intake (CV-First Mass Sourcing)

**Status:** Draft
**Created:** 2026-06-07
**Author:** Claude + Hạnh
**Depends on:** SPEC-024 (Recruitment ATS), SPEC-003 (RBAC), SPEC-006 (Employee Bulk Import — reference pattern)

---

## Objective

Cho phép HR upload hàng loạt CV (tới hàng chục file/lần) vào **một job**, hệ thống tự
trích text + parse bằng Claude Haiku để điền sẵn thông tin ứng viên, gom vào **một màn
hình review hàng loạt**; HR sửa/loại rồi xác nhận để tạo `Candidate` thật và tự động đưa
vào pipeline của job. Mục tiêu: chuyển công sức từ *"100 lần điền form + 100 lần upload"*
xuống *"vài lần kéo-thả + 1 lần lướt duyệt"*.

## Vấn đề hiện tại

Luồng hiện có là **candidate-first**: bắt buộc tạo `Candidate` thủ công trước
([candidate.service.ts](apps/api/src/domain/services/candidate.service.ts)), rồi mới
upload CV vào candidate đó
([recruitment.routes.ts](apps/api/src/app/routes/v1/recruitment.routes.ts) —
`POST /recruitment/candidates/:id/attachments`), rồi review từng gợi ý parse và apply tay.
Với 100 CV/job, luồng này không scale. Cần **đảo luồng thành CV-first**.

## Target Users

| User | Quyền |
|------|-------|
| **Super Admin** | Bulk import vào bất kỳ tenant nào |
| **HR Manager** | Bulk import trong tenant của mình |
| **Manager** | ❌ Không truy cập |
| **Employee** | ❌ Không truy cập |

Chặn server-side bằng permission mới **`recruitment:bulk_import`** (thêm vào nhóm
`recruitment` trong `packages/shared/src/types/rbac.ts`). Mọi thao tác đều tenant-scoped.

---

## Product Decisions (đã chốt)

| Quyết định | Lựa chọn |
|------------|----------|
| **Nơi lưu CV chưa duyệt** | **Bảng staging riêng** `BulkImportBatch` + `BulkImportItem`. KHÔNG tạo record nháp vào bảng `Candidate`; chỉ tạo `Candidate` thật khi HR xác nhận. |
| **Auto-apply vào job** | **Có.** Khi xác nhận, mỗi candidate tự tạo `Application` vào **stage đầu** (order nhỏ nhất, thường `SOURCED`/`SCREEN`) của job. |
| **Dedup** | **Mềm — như review item, không throw.** Email/phone trùng (candidate đã có hoặc trùng trong cùng batch) → đánh cờ ở màn review, không chặn upload. |
| **CV trùng candidate đã tồn tại** | **Gắn CV + tạo Application vào candidate cũ** (không tạo candidate mới); tạo Application nếu candidate chưa apply job này. Mặc định resolution = `LINK_EXISTING`, HR có thể đổi. |
| **CV scan ảnh / không trích được text** | Upload vẫn thành công; `parseStatus=PARSE_FAILED`, **fallback tên theo filename**, HR điền tay ở màn review. |
| **Giới hạn batch** | **50 file/lần, 10MB/file** (giữ nguyên `CV_MAX_FILE_BYTES`). MIME chỉ PDF + DOCX (reuse `CV_ALLOWED_MIME`). |
| **Commit khi confirm** | **Per-item, không all-or-nothing.** Mỗi item commit độc lập trong transaction riêng; lỗi 1 item không rollback cả batch. Trả summary per-item. |

> **Khác biệt với SPEC-006 / SPEC-026 (spreadsheet import):** nguồn là **file CV** (không phải
> bảng); parse **bất đồng bộ qua LLM** (không phải validate đồng bộ); staging ở **DB** (không phải
> Redis); commit **per-item** (không phải atomic toàn lô) vì một lô lớn không nên rollback toàn
> bộ chỉ vì một CV hỏng.

---

## Core Features

### 1. Bulk Upload CV vào một Job
**Acceptance Criteria:**
- [ ] `POST /recruitment/jobs/:jobId/bulk-import` nhận multipart **nhiều file** (multer array, ≤ 50)
- [ ] Mỗi file: validate mime (PDF/DOCX) + size (≤ 10MB); file không hợp lệ bị từ chối **riêng dòng đó**, các file khác vẫn nhận
- [ ] Mỗi file hợp lệ: lưu qua [cv-storage.ts](apps/api/src/infrastructure/storage/cv-storage.ts) (UUID filename) → trích text đồng bộ qua [cv-text-extract.ts](apps/api/src/domain/recruitment/cv-text-extract.ts) → tạo `BulkImportItem` (status `PARSING`) → enqueue job parse
- [ ] Tạo `BulkImportBatch` (status `DRAFT`) gắn `jobId`, `createdById`, đếm `totalItems`
- [ ] Trả `{ batchId, items: [{ id, fileName, status, parseStatus }] }`
- [ ] Guard: `requirePermission('recruitment:bulk_import')`, tenant-scoped, job phải thuộc tenant và đang `OPEN`/`DRAFT`

### 2. Async Parse (tái dùng Haiku pipeline)
**Acceptance Criteria:**
- [ ] Job parse mới (queue `hrm.recruitment.cv_parse`, job name `parse-bulk-item`) đọc file, gọi `getResumeParser()` → ghi kết quả vào `BulkImportItem.parsedData` thay vì `CandidateAttachment`
- [ ] Tái dùng [resume-parser.ts](apps/api/src/domain/recruitment/resume-parser.ts) + [haiku-resume-parser.ts](apps/api/src/domain/recruitment/haiku-resume-parser.ts) + `parsedResumeSchema` (Zod validate, chặn hallucination)
- [ ] Parse xong → `parseStatus=DONE`, copy `parsedData` vào `reviewedData` (giá trị HR sẽ chỉnh)
- [ ] Parse lỗi/không có text → `parseStatus=FAILED`, `reviewedData.fullName` = tên file (bỏ đuôi), các field khác trống
- [ ] Sau parse, chạy **soft-dedup** (xem Feature 4) và set `duplicateOf*` + `resolution` mặc định
- [ ] Worker concurrency giữ ≤ 2 (như hiện tại); retry 2 lần backoff 2s; **không log nội dung CV**

### 3. Review Batch (màn hình duyệt hàng loạt)
**Acceptance Criteria:**
- [ ] `GET /recruitment/bulk-import/:batchId` trả batch + toàn bộ items (parsed/reviewed data, parseStatus, cờ trùng, resolution)
- [ ] Frontend **poll** mỗi 2s khi còn item `PARSING`/`PENDING` (mirror pattern [useCandidateAttachments.ts](apps/web/src/features/recruitment/hooks/useCandidateAttachments.ts))
- [ ] `PATCH /recruitment/bulk-import/:batchId/items/:itemId` cho HR sửa `reviewedData` (tên/email/phone/title/skills...) hoặc đổi `resolution` (`NEW` / `LINK_EXISTING` / `SKIP`)
- [ ] Validate `reviewedData` qua schema (reuse logic candidate validator); item lỗi validate hiển thị inline, không cho confirm
- [ ] `DELETE /recruitment/bulk-import/:batchId` huỷ batch → xoá file đã lưu + items (cleanup)

### 4. Soft Dedup (đánh cờ, không chặn)
**Acceptance Criteria:**
- [ ] So `reviewedData.email` (lowercased) và `phone` (E.164) với `Candidate` hiện có trong tenant (reuse `candidateRepository.findByEmail/findByPhone`)
- [ ] So tên không dấu/hoa-thường (reuse `normalizeName`) — match tên → cờ `NAME` (mức cảnh báo yếu hơn email/phone)
- [ ] So **trong cùng batch** (2 CV cùng email/phone) → đánh dấu cặp trùng để HR gộp/loại
- [ ] Item có trùng cứng (email/phone) → mặc định `resolution=LINK_EXISTING`, `duplicateOfCandidateId` trỏ candidate cũ; HR đổi sang `NEW` (force) hoặc `SKIP`
- [ ] Cờ trùng hiển thị rõ ở review row: "Đã tồn tại: <tên candidate> (email/phone)"

### 5. Confirm + Commit (per-item)
**Acceptance Criteria:**
- [ ] `POST /recruitment/bulk-import/:batchId/confirm` chỉ chạy khi batch `REVIEWING` và không còn item `PARSING`
- [ ] Với mỗi item **không** `SKIP`, xử lý độc lập trong transaction riêng:
  - `resolution=NEW`: tạo `Candidate` (từ `reviewedData`, `force=true` vì HR đã duyệt) → tạo `CandidateAttachment` trỏ file đã lưu + gắn `parsedData` + `rawCvText` → tạo `Application` vào stage đầu của job → ghi `ApplicationStageHistory` (first move) + `ApplicationActivity` ("Tạo từ bulk import")
  - `resolution=LINK_EXISTING`: gắn `CandidateAttachment` vào `duplicateOfCandidateId`; tạo `Application` vào job nếu chưa có ACTIVE application cho cặp candidate×job
- [ ] **Re-check dedup ngay trước khi tạo** (chống race: email bị tạo giữa review và confirm) → nếu phát sinh trùng cứng mà resolution=`NEW`, tự chuyển item sang lỗi/`LINK_EXISTING` và báo ở summary, **không** vỡ DB constraint
- [ ] Lỗi 1 item → đánh dấu item đó `failed` + lý do, **tiếp tục** các item còn lại
- [ ] Set `candidateId`/`applicationId` lên item, status `CONFIRMED`; batch → `CONFIRMED`, `confirmedAt`
- [ ] Trả summary `{ createdCandidates, linkedExisting, applicationsCreated, skipped, failed: [{ itemId, reason }] }`

### 6. Frontend (trong Job detail)
**Acceptance Criteria:**
- [ ] Nút "Nhập CV hàng loạt" trên Job detail (chỉ hiện với `recruitment:bulk_import` qua `<Can>`)
- [ ] Wizard trong `Sheet`/stepped: (1) Kéo-thả nhiều CV → (2) Đang parse (progress + skeleton, poll) → (3) Bảng review (dense table: tên/email/phone/skills/cờ trùng/resolution, sửa inline, toggle loại) → (4) Xác nhận → (5) Summary
- [ ] Dense data table theo `ui-modern.md`: sticky header, density, skeleton khi parse, empty/error states, `tabular-nums`
- [ ] Light + dark, vi + en i18n (không hardcode text), chỉ dùng design token
- [ ] Confirm thành công → toast + invalidate `candidateKeys` + application/pipeline queries của job; đóng wizard
- [ ] TanStack Query hooks mới: `useBulkImportUpload`, `useBulkImportBatch` (poll), `useUpdateBulkImportItem`, `useConfirmBulkImport`, `useCancelBulkImport`

---

## Out of Scope (iteration này)

- Public careers page / form ứng tuyển tự phục vụ (ứng viên tự nộp)
- Email inbox ingestion (forward CV vào địa chỉ → auto-ingest)
- OCR cho PDF scan ảnh (chỉ fallback filename, không OCR)
- Bulk import vào "candidate pool" chung **không gắn job** (spec này luôn gắn 1 job)
- Bulk import bất đồng bộ vượt 50 file/lần (chia nhiều batch)
- AI matching/ranking/scoring CV so với JD (chỉ parse trích xuất, không chấm điểm)
- Bulk email/notification cho ứng viên sau import

---

## Technical Approach

### Reuse (bám code hiện có)
- **Upload:** mở rộng [cv-upload.middleware.ts](apps/api/src/app/middlewares/cv-upload.middleware.ts) thêm biến thể `uploadCvFiles()` (multer `.array`, ≤ 50, cùng mime/size filter).
- **Storage / text extract / parser:** tái dùng nguyên `cv-storage.ts`, `cv-text-extract.ts`, `resume-parser.ts`, `haiku-resume-parser.ts`, `parsedResumeSchema`.
- **Queue:** thêm job type `parse-bulk-item` vào queue `hrm.recruitment.cv_parse`; worker [cv-parse.worker.ts](apps/api/src/domain/recruitment/cv-parse.worker.ts) phân nhánh theo target (`CandidateAttachment` cũ vs `BulkImportItem` mới).
- **Dedup:** tái dùng `candidateRepository.findByEmail/findByPhone` + `normalizeName`.
- **Create candidate/application:** tái dùng `candidateService.create` (force) + service tạo Application + stage history hiện có của ATS.
- **RBAC:** thêm `'bulk_import'` vào mảng `recruitment` trong `packages/shared/src/types/rbac.ts`; cập nhật `catalog.ts` cấp cho SUPER_ADMIN + HR_MANAGER; `seedPermissionCatalog()` + `syncSystemRolesForTenant()` tự đồng bộ.
- **Frontend:** mirror wizard bulk-import hiện có (`EmployeeImportWizard`) về cấu trúc step + hooks.

### Data model (Prisma — models mới)
```prisma
enum BulkImportStatus { DRAFT REVIEWING CONFIRMED CANCELLED }
enum BulkImportItemStatus { PARSING PARSED PARSE_FAILED CONFIRMED SKIPPED FAILED }
enum BulkImportItemResolution { NEW LINK_EXISTING SKIP }

model BulkImportBatch {
  id          String   @id @default(cuid())
  tenantId    String
  jobId       String
  createdById String
  status      BulkImportStatus @default(DRAFT)
  totalItems  Int      @default(0)
  createdAt   DateTime @default(now())
  confirmedAt DateTime?
  job         Job      @relation(fields: [jobId], references: [id])
  items       BulkImportItem[]
  @@index([tenantId, jobId])
  @@map("bulk_import_batches")
}

model BulkImportItem {
  id            String   @id @default(cuid())
  batchId       String
  status        BulkImportItemStatus     @default(PARSING)
  resolution    BulkImportItemResolution @default(NEW)
  fileUrl       String
  fileName      String
  mimeType      String
  rawCvText     String?  @db.Text
  parseStatus   ParseStatus @default(PENDING)
  parserProvider String?
  parsedData    Json?      // raw parser output
  reviewedData  Json?      // HR-editable, what gets written on confirm
  duplicateOfCandidateId String?
  duplicateReason        String?  // EMAIL | PHONE | NAME
  candidateId   String?    // set after confirm
  applicationId String?
  failureReason String?
  createdAt     DateTime @default(now())
  batch         BulkImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@index([batchId])
  @@map("bulk_import_items")
}
```

### API contracts
```
POST   /api/v1/recruitment/jobs/:jobId/bulk-import   (multipart, ≤50 files) -> { batchId, items[] }
GET    /api/v1/recruitment/bulk-import/:batchId                              -> { batch, items[] }
PATCH  /api/v1/recruitment/bulk-import/:batchId/items/:itemId  (json)        -> updated item
POST   /api/v1/recruitment/bulk-import/:batchId/confirm                      -> { createdCandidates, linkedExisting, applicationsCreated, skipped, failed[] }
DELETE /api/v1/recruitment/bulk-import/:batchId                              -> { cancelled: true }
```
Tất cả dưới auth + `requirePermission('recruitment:bulk_import')`, tenant-scoped.

### Data flow
```
HR kéo-thả N CV vào job
   └─► /jobs/:jobId/bulk-import: lưu file + trích text + tạo BulkImportItem + enqueue parse
                                   │
        queue parse-bulk-item ─► getResumeParser() ─► parsedData + reviewedData + soft-dedup
                                   │ (poll GET batch tới khi hết PARSING)
                                   ▼
        Màn review: HR sửa reviewedData / đổi resolution / loại dòng rác
                                   │
        /confirm ─► per-item transaction:
            NEW          → Candidate + CandidateAttachment + Application(stage đầu) + history
            LINK_EXISTING→ Attachment vào candidate cũ + Application nếu chưa có
                                   ▼ (lỗi 1 item → mark failed, tiếp tục)
        Summary { created, linked, applications, skipped, failed[] } ─► UI
```

### Error / status codes (i18n vi/en)
`BULK_IMPORT_NO_FILES`, `BULK_IMPORT_TOO_MANY_FILES`, `BULK_IMPORT_FILE_TOO_LARGE`,
`BULK_IMPORT_INVALID_MIME`, `BULK_IMPORT_JOB_NOT_OPEN`, `BULK_IMPORT_BATCH_NOT_FOUND`,
`BULK_IMPORT_STILL_PARSING`, `BULK_IMPORT_ITEM_VALIDATION`, `BULK_IMPORT_DUPLICATE_RACE`.

---

## Code Style
- Tuân thủ toàn bộ rule trong `.claude/rules/` (error-handling, security, naming, api-conventions, database, testing, monitoring).
- Chỉ dùng design token; Tailwind v4; dark mode qua `.dark`; i18n vi+en (không hardcode text).
- Tái sử dụng primitive: `candidateService`, `<Can>`, `usePermission`, toast wrapper, query keys (`candidateKeys`, `applicationKeys`).
- **Không log nội dung CV / PII** (giữ nguyên kỷ luật của pipeline parse hiện tại).

---

## Testing Strategy
- **Unit:**
  - Soft-dedup: email/phone exact + name fuzzy (có dấu/không dấu); trùng trong cùng batch
  - Fallback filename khi parse FAILED / CV không có text
  - Validate `reviewedData` (email/phone/skills) trước confirm
  - Worker phân nhánh target `BulkImportItem` ghi đúng `parsedData`/`parseStatus`
- **Integration:**
  - Upload N file → tạo 1 batch + N item, file lưu đúng, parse job được enqueue; file sai mime bị loại riêng dòng
  - `/confirm` happy path: K item `NEW` → K Candidate + K Application vào stage đầu (assert `currentStageId` = stage order nhỏ nhất); L item `LINK_EXISTING` → 0 candidate mới, attachment gắn candidate cũ, application tạo nếu chưa có
  - **Dedup race:** tạo candidate trùng email giữa review và confirm → item `NEW` tự xử lý (không vỡ unique constraint), báo trong `failed`/`linked`
  - **Per-item isolation:** 1 item lỗi → các item còn lại vẫn commit; summary `failed` chứa đúng item
  - RBAC: 403 cho EMPLOYEE/MANAGER; tenant isolation (không import vào job tenant khác)
- **E2E (Playwright):** mở job → kéo-thả ≥3 CV (gồm 1 file scan ảnh không text + 1 trùng candidate đã có) → đợi parse → thấy bảng review với field điền sẵn, dòng scan ảnh fallback filename, dòng trùng có cờ "đã tồn tại" → loại 1 dòng rác, sửa 1 tên → confirm → thấy summary; assert pipeline của job tăng đúng số application.

---

## Boundaries

### Always Do
- Enforce `requirePermission('recruitment:bulk_import')` server-side; tenant-scope mọi query/write
- Upload chỉ nhận PDF/DOCX, ≤ 10MB/file, ≤ 50 file/batch
- Re-check dedup ngay trước commit (chống race); không bao giờ làm vỡ unique constraint email
- Chỉ tạo `Candidate` thật khi HR confirm; CV chưa duyệt ở bảng staging
- Cleanup file khi cancel batch

### Ask First
- Chốt cap cuối: 50 file/batch đủ chưa; có cần chunk upload phía client không
- Có cần TTL tự xoá batch `DRAFT`/`REVIEWING` bị bỏ quên (vd. 7 ngày) — dọn file rác
- Có cần job parse chạy concurrency cao hơn 2 khi batch lớn (đánh đổi rate-limit Haiku)
- Khi candidate cũ đã có ACTIVE application cho job này thì `LINK_EXISTING` xử lý sao (skip application, vẫn gắn CV?)

### Never Do
- Không tạo record nháp trong bảng `Candidate` trước khi confirm
- Không rollback cả batch khi 1 item lỗi (per-item isolation)
- Không log nội dung CV / PII
- Không bypass tenant scoping hay ghi chéo tenant
- Không auto-confirm — luôn qua bước review của HR

---

## Open Questions (cho /plan)
1. Worker hiện tại ([cv-parse.worker.ts](apps/api/src/domain/recruitment/cv-parse.worker.ts)) nên phân nhánh theo `target` trong job data, hay tách worker mới? (ưu tiên phân nhánh để tái dùng connection/concurrency)
2. Khi `LINK_EXISTING` mà candidate cũ đã có ACTIVE application cho job này: skip tạo application (chỉ gắn CV) hay báo lỗi item?
3. Có cần giới hạn tổng số batch `DRAFT` đồng thời / TTL dọn file rác không?
4. Stage đầu xác định bằng `JobStage.order` nhỏ nhất — có job nào không có stage (cần guard tạo stage trước khi import)?
5. Upload 50 file × 10MB = ~500MB/request: cần chỉnh body/proxy limit hay chuyển sang chunk upload phía client?

---

## Next Step
Sau khi duyệt, chạy `/plan` để decompose thành vertical slices
(Prisma model + migration + RBAC permission → upload middleware (array) → staging service →
parse worker branch + soft-dedup → review/confirm service (per-item) → API routes →
frontend wizard + review table + hooks → i18n → unit/integration/E2E tests).
