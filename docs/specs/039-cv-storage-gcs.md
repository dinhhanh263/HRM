# SPEC-039: CV Storage trên Google Cloud Storage (GCS)

## Objective

Chuyển backend lưu file CV từ đĩa local sang **Google Cloud Storage** cho production,
qua một lớp **storage driver** chọn bằng env (`local` cho dev/test, `gcs` cho prod).
Đóng kín abstraction đang bị rò (`resolveCvDiskPath` + `fs.readFile/sendFile` lặp ở 3 nơi)
để callers không còn phụ thuộc vào "đĩa". Mục tiêu là chạy đúng khi API và BullMQ worker
nằm ở **2 container khác nhau** — điều mà đĩa local không thể đáp ứng.

## Target Users

Không có UI mới. Ảnh hưởng tầng hạ tầng của module Tuyển dụng (SPEC-024/027): upload CV
ứng viên, bulk CV intake, parse CV (worker), và tải CV về (HR có quyền `recruitment:candidate_view`).

## Bối cảnh hiện trạng (code thật)

- `apps/api/src/infrastructure/storage/cv-storage.ts` — 4 hàm: `storeCvFile`, `resolveCvDiskPath`,
  `deleteCvFile`, type `StoredFile { fileUrl, diskPath }`. Tên file lưu là UUID (chống path traversal).
- `cv.config.ts` — `CV_STORAGE_DIR` (default `storage/cv`), `CV_URL_PREFIX = '/uploads/cv'`,
  `CV_MAX_FILE_BYTES = 10MB`, `CV_ALLOWED_MIME = {pdf, docx}`.
- Upload dùng `multer.memoryStorage()` → caller luôn có sẵn `file.buffer` (an toàn vì cap 10MB).
- **Call sites (3 nơi đang rò abstraction):**
  - `domain/recruitment/cv-parse.worker.ts:54-57` — `resolveCvDiskPath()` → `readFile(diskPath)` để lấy buffer parse.
  - `domain/services/bulk-import.service.ts:114/182/224` — `storeCvFile` / `deleteCvFile` / `resolveCvDiskPath`.
  - `domain/services/candidate-attachment.service.ts:68/126` — `storeCvFile` / `resolveCvDiskPath` (tải CV về).
- `fileUrl` được lưu trong DB (`candidate_attachments.file_url`, `cv_import_items.file_url`) —
  **giữ nguyên format** `'/uploads/cv/<uuid>.<ext>'` để không phải migrate dữ liệu.

## Core Features

### 1. Storage driver interface
- File mới: `infrastructure/storage/cv-storage.types.ts` — interface `CvStorageDriver`:
  - `store(buffer, originalName, mimeType): Promise<StoredFile>` — trả `{ fileUrl }`.
  - `read(fileUrl): Promise<Buffer>` — đọc nội dung (worker + bulk-import dùng để parse).
  - `createReadStream(fileUrl): Promise<{ stream, contentType }>` — phục vụ tải về (route download).
  - `remove(fileUrl): Promise<void>` — best-effort xoá, file không tồn tại **không** throw.
- `StoredFile` rút gọn còn `{ fileUrl: string }` — **bỏ `diskPath`** khỏi public type (chi tiết đĩa
  là nội bộ của local driver).
- **Acceptance**: cả 3 call site biên dịch chỉ dùng `store/read/createReadStream/remove`; không
  còn ai import `resolveCvDiskPath` hay gọi `fs` trực tiếp cho CV.

### 2. Local driver (giữ hành vi hiện tại)
- File: `infrastructure/storage/local-cv-storage.ts` — bê logic hiện có vào.
- `store` ghi UUID vào `CV_STORAGE_DIR`; `read` = `fs.readFile`; `createReadStream` = `fs.createReadStream`;
  `remove` = `unlink` (nuốt `ENOENT`). Giữ guard chống traversal khi resolve filename từ `fileUrl`.
- **Acceptance**: toàn bộ test integration/E2E tuyển dụng hiện có xanh y như trước với `STORAGE_DRIVER=local`.

### 3. GCS driver (production)
- File: `infrastructure/storage/gcs-cv-storage.ts`, dùng `@google-cloud/storage`.
- Auth qua **Application Default Credentials (ADC)** — trên GCP ăn theo service account gắn vào
  Cloud Run/GKE (**Workload Identity, không có key tĩnh**); máy dev dùng `gcloud auth application-default login`.
- Object key = phần sau `CV_URL_PREFIX`, tức `cv/<uuid>.<ext>` (giữ `fileUrl` y hệt local để DB không đổi).
- `store`: `bucket.file(key).save(buffer, { contentType, resumable:false })`.
- `read`: `bucket.file(key).download()` → buffer.
- `createReadStream`: `bucket.file(key).createReadStream()` + content-type suy từ đuôi file.
- `remove`: `bucket.file(key).delete({ ignoreNotFound: true })`.
- **Acceptance**: unit test với GCS client mock chứng minh `store/read/createReadStream/remove` gọi
  đúng API và map `fileUrl ↔ key` đúng chiều.

### 4. Driver selection
- File: `infrastructure/storage/cv-storage.ts` trở thành điểm chọn driver: đọc `STORAGE_DRIVER`
  (`'local'` default | `'gcs'`) **một lần** lúc khởi tạo, export 4 hàm `storeCvFile/readCvFile/createCvReadStream/deleteCvFile`
  ủy quyền cho driver đã chọn — giữ API cũ làm mặt tiền để giảm số chỗ sửa ở caller.
- `gcs` mà thiếu `GCS_BUCKET` → **fail fast** khi khởi tạo (ném lỗi cấu hình rõ ràng), không chạy nửa vời.
- **Acceptance**: `STORAGE_DRIVER` không set → local; `=gcs` không có `GCS_BUCKET` → lỗi cấu hình lúc boot.

### 5. Route tải CV — stream qua API (giữ RBAC)
- Giữ nguyên đường tải qua API (đang check `recruitment:candidate_view`), đổi từ `sendFile(diskPath)`
  sang `createCvReadStream(fileUrl)` rồi `.pipe(res)` kèm `Content-Type` + `Content-Disposition` (filename gốc).
- **Acceptance**: HR có quyền tải được file đúng nội dung & content-type; thiếu quyền → 403 như cũ.

### 6. Cấu hình & tài liệu
- `cv.config.ts` thêm: `STORAGE_DRIVER`, `GCS_BUCKET`, `GCP_PROJECT_ID` (optional khi ADC suy ra được).
- Cập nhật `apps/api/.env.example`: thêm 3 biến trên + comment hướng dẫn ADC; **đồng thời thay
  `RESEND_API_KEY` thật bằng placeholder** (key cũ đã lộ — xem Boundaries).
- **Acceptance**: `.env.example` không còn secret thật; mô tả rõ local vs gcs.

## Out of Scope

- **Signed URL** tải trực tiếp từ GCS (bỏ qua API): để sau; bản này stream qua API cho đơn giản + giữ RBAC tập trung.
- **Lifecycle/retention tự xoá CV ứng viên loại**: cấu hình ở tầng bucket (infra/Terraform), không thuộc code task này — chỉ ghi chú trong checklist deploy.
- **Migrate dữ liệu CV cũ** từ đĩa lên GCS: prod là deploy mới, chưa có CV thật → không cần. Nếu sau này cần, làm script riêng.
- Đổi storage cho các loại file khác (avatar nhân viên, import Excel) — task này chỉ CV.
- Mã hoá CMEK (dùng mã hoá mặc định của GCS at-rest).
- IaC/Terraform tạo bucket + IAM (việc của giai đoạn deploy infra).

## Technical Approach

- Dependency mới: `@google-cloud/storage` (Apache-2.0, SDK chính thức Google, native TS types).
- Pattern driver thuần: 1 interface + 2 impl + 1 selector; callers gọi qua mặt tiền cũ.
- Thay thế triệt để cặp rò `resolveCvDiskPath` + `fs` ở 3 call site bằng `readCvFile()` (buffer)
  và `createCvReadStream()` (route). Sau task này **không còn** `resolveCvDiskPath` công khai.
- Không đụng schema Prisma, không đụng `fileUrl` đã lưu → zero migration.
- Bucket region đặt cùng region compute (khuyến nghị `asia-southeast1`) — quyết định lúc deploy, không trong code.

## Code Style

- Tuân thủ `.claude/rules/` (clean-code, error-handling, security, naming-conventions, testing).
- One responsibility/file; driver injection thay vì if/else rải rác.
- Không `any`; type cho mọi hàm async (đã là chuẩn dự án).

## Testing Strategy

- **Unit** (`tests/unit/storage/`):
  - `local-cv-storage`: store→read round-trip ghi/đọc đúng buffer; `remove` file không tồn tại không throw; chặn traversal.
  - `gcs-cv-storage`: mock `@google-cloud/storage`, assert `store/read/createReadStream/remove` gọi đúng method + map key.
  - selector: default `local`; `gcs` thiếu `GCS_BUCKET` → throw lúc init.
- **Integration**: route tải CV stream đúng nội dung dưới RBAC (driver local); 403 khi thiếu quyền.
- **Regression**: suite tuyển dụng (`recruitment-critical-path.spec.ts`) + bulk CV intake + cv-parse worker xanh với `STORAGE_DRIVER=local`.

## Boundaries

### Always Do
- Mặc định `local` cho dev/test — không buộc dev/CI phải có GCS credentials.
- GCS dùng ADC/Workload Identity; **không** đưa access key tĩnh vào env.
- Giữ format `fileUrl` cũ để không phải migrate DB.
- Bucket private (uniform bucket-level access) — CV là PII, chỉ tải qua API có RBAC.

### Ask First
- Nếu phát sinh nhu cầu Signed URL / public access (lệch khỏi "stream qua API").
- Nếu cần đổi format `fileUrl` (kéo theo migration).

### Never Do
- Không để public bucket / public ACL cho CV.
- Không log nội dung CV hay đường dẫn đầy đủ kèm PII.
- Không commit (user làm việc local).
- Không để lại `RESEND_API_KEY` thật trong `.env.example` (rotate + placeholder).

## Triển khai production (ngoài code — checklist deploy)

Bật bằng env, không cần đổi code:
1. **Tạo bucket** ở region cùng compute (khuyến nghị `asia-southeast1` Singapore cho user VN).
2. **Bucket private**: bật *uniform bucket-level access*, **không** public ACL (CV là PII).
3. **Service account + Workload Identity**: SA của Cloud Run/GKE được cấp role `roles/storage.objectAdmin`
   (hoặc hẹp hơn: `objectCreator` + `objectViewer` + quyền delete) **chỉ trên bucket này**. Không tạo/đưa key tĩnh.
4. **Set env trên service API + worker**: `STORAGE_DRIVER=gcs`, `GCS_BUCKET=<tên>`, (tuỳ chọn) `GCP_PROJECT_ID`.
5. **Lifecycle/retention**: rule tự xoá object CV của ứng viên bị loại sau N tháng (chính sách lưu trữ) — cấu hình tầng bucket.
6. Mã hoá at-rest dùng mặc định của GCS (CMEK nếu cần — ngoài phạm vi).

> Liên quan: **rotate `RESEND_API_KEY`** đã lộ trong git (key thật, live) — tạo key mới trên Resend, thu hồi key cũ.

*Created: 2026-06-16 | SPEC-039*
