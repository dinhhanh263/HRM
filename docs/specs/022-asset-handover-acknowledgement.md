# Feature: Asset Handover Acknowledgement & Signature — Ký xác nhận biên bản bàn giao tài sản

## Objective
Số hoá quy trình **ký biên bản bàn giao tài sản**. Hiện tại khi cấp phát thiết bị, HR in form cứng đưa
người nhận ký tay. Tính năng này cho phép người nhận **ký xác nhận ngay trong hệ thống** — bằng chữ ký vẽ
tay trên màn hình (bàn giao trực tiếp) **hoặc** xác nhận từ xa qua tài khoản của chính họ (e-acknowledge) —
đồng thời sinh **biên bản bàn giao PDF** có khối chữ ký. Đây là phần mở rộng của SPEC-021 (`assets`), gắn
vào luồng cấp phát đã có.

## Target Users
- **HR_MANAGER / SUPER_ADMIN** (`assets:assign` + `assets:acknowledge`): cấp phát tài sản; tuỳ chọn lấy chữ
  ký người nhận **ngay tại màn hình** khi bàn giao trực tiếp; xuất biên bản PDF; theo dõi phiếu nào đã ký /
  còn chờ ký.
- **EMPLOYEE** (người nhận tài sản, `assets:acknowledge`): **self-service** — thấy "phiếu chờ ký" trong
  trang "Tài sản của tôi", mở ra, vẽ chữ ký (kể cả trên điện thoại) và xác nhận từ xa.
- **MANAGER** (`assets:view`): xem trạng thái ký (read-only), tải biên bản PDF của tài sản team.

> Bám ui-modern §2 (adaptive theo role) & §12 (self-service mobile-first): người nhận ký được trên điện
> thoại trong ≤ 2 chạm từ "Tài sản của tôi".

## Quyết định phạm vi (đã chốt với người dùng)
1. **Hỗ trợ cả hai kịch bản ngang nhau**: (A) ký bằng canvas trên màn hình khi bàn giao trực tiếp; (B) xác
   nhận từ xa trong app bằng tài khoản người nhận.
2. **Cấp phát ngay, ký sau**: tài sản chuyển `ASSIGNED` ngay khi HR cấp phát; biên bản (handover record) ở
   trạng thái **"Chờ ký"** cho tới khi người nhận ký. Việc ký **không chặn** quyền sở hữu/sử dụng.
3. **Biên bản PDF có trong v1**: tái sử dụng pipeline PDF của payslip (`pdfkit` + Be Vietnam Pro). PDF có
   khối chữ ký (nhúng ảnh chữ ký nếu đã ký; để trống ký tay nếu chưa).
4. **Lưu cả ảnh chữ ký + danh tính + thời điểm**: ảnh chữ ký (PNG base64), người ký, phương thức ký, mốc
   thời gian.

## Core Features

### 1. Lấy chữ ký tại chỗ khi cấp phát (ON_SCREEN, tuỳ chọn) — HR
- Mở rộng `AssignAssetSheet`: thêm khu vực **"Ký xác nhận tại chỗ"** (progressive disclosure, ẩn sau toggle).
  HR có thể đưa thiết bị cho người nhận vẽ chữ ký ngay trên màn hình rồi cấp phát một lần.
- Nếu HR **bỏ qua** → cấp phát ngay, biên bản ở trạng thái **PENDING** (ký sau).
- **Acceptance**: cấp phát kèm chữ ký → assignment `ACTIVE` + `ackStatus=SIGNED`, `ackMethod=ON_SCREEN`,
  lưu ảnh chữ ký + `acknowledgedAt`. Cấp phát không chữ ký → `ackStatus=PENDING`.

### 2. Ký xác nhận từ xa (IN_APP) — EMPLOYEE self-service
- Trong "Tài sản của tôi", tài sản có biên bản `PENDING` hiển thị **thẻ "Phiếu chờ ký"** + nút "Ký xác nhận".
- Mở dialog/sheet ký: hiển thị thông tin tài sản + canvas vẽ chữ ký (hỗ trợ chuột & cảm ứng), nút "Xoá vẽ
  lại" + "Xác nhận đã nhận".
- **Ownership**: người nhận chỉ ký được biên bản của **chính mình** (`assignment.employeeId` == employee của
  caller). Ký biên bản người khác → **403**.
- **Acceptance**: EMPLOYEE ký phiếu của mình → `ackStatus=SIGNED`, `ackMethod=IN_APP`, `acknowledgedByUserId`
  = chính họ, ảnh chữ ký + thời điểm lưu lại; thẻ "chờ ký" biến mất. Ký phiếu không phải của mình → **403**.
  Ký phiếu đã ký rồi → **409**.

### 3. Biên bản bàn giao PDF (BIÊN BẢN BÀN GIAO TÀI SẢN)
- `GET /assets/assignments/:assignmentId/handover.pdf` → sinh PDF bằng `pdfkit` (reuse font/đường dẫn của
  `payslip.pdf.ts`). Nội dung: tên công ty, mã/tên tài sản, serial, tình trạng khi giao, người giao (HR),
  người nhận, ngày bàn giao, ghi chú; **khối chữ ký**: nhúng ảnh chữ ký nếu `SIGNED` + dòng "Đã ký điện tử
  lúc {thời điểm}"; nếu `PENDING` → để trống cho ký tay.
- **Quyền**: `assets:view` **và** (ownership người nhận **hoặc** có `assets:assign`).
- **Acceptance**: tải PDF của biên bản đã ký → mở được, có ảnh chữ ký + danh tính + thời điểm. Biên bản chưa
  ký → PDF có chỗ trống ký tay. PDF render đúng tiếng Việt có dấu + ký tự ₫ (font Be Vietnam Pro).

### 4. Hiển thị trạng thái ký
- Tab "Lịch sử cấp phát" (`AssetAssignmentHistory`) trên `AssetDetailPage`: mỗi assignment hiển thị **badge
  trạng thái ký** ("Đã ký" / "Chờ ký") + phương thức + thời điểm ký + nút "Xuất biên bản (PDF)".
- HR (`assets:assign`) có thể mở phiếu `PENDING` để **lấy chữ ký tại chỗ sau** (ON_SCREEN muộn) khi người
  nhận tới ký trực tiếp.
- **Acceptance**: badge + thời điểm hiển thị đúng theo dữ liệu; nút PDF hoạt động; status badge có cả màu +
  chữ (a11y, không chỉ dựa màu).

## Out of Scope (đợt này)
- **Ký xác nhận khi THU HỒI** (return acknowledgement) — v1 chỉ ký biên bản **bàn giao** (cấp phát).
- Chữ ký số PKI/CA hợp pháp (digital signature có chứng thư), OTP/eKYC, đóng dấu thời gian (TSA). v1 là
  **e-acknowledgement** (ảnh chữ ký + danh tính + timestamp lưu kiểm chứng), không phải chữ ký số pháp lý.
- Gửi email/thông báo nhắc người nhận ký → **Ask First** (xem Boundaries), không bắt buộc MVP.
- Lưu chữ ký vào object storage (S3/R2) — v1 lưu base64 trong DB (kích thước nhỏ, vài KB).
- Mẫu biên bản tuỳ biến theo tenant; nhiều ngôn ngữ trên PDF (PDF chỉ tiếng Việt như payslip).

## Technical Approach

### Data model (Prisma — mở rộng `AssetAssignment`, không thêm bảng mới)
Biên bản bàn giao **chính là** bản ghi `AssetAssignment` đã có → mở rộng tại chỗ, tránh bảng thừa.

```prisma
enum AssetAckStatus {
  PENDING // chờ ký
  SIGNED  // đã ký xác nhận
}

enum AssetAckMethod {
  ON_SCREEN // ký vẽ tay trên màn hình lúc bàn giao trực tiếp
  IN_APP    // người nhận tự xác nhận từ xa qua tài khoản
}

model AssetAssignment {
  // ... các field hiện có ...
  ackStatus           AssetAckStatus  @default(PENDING) @map("ack_status")
  ackMethod           AssetAckMethod? @map("ack_method")
  acknowledgedAt      DateTime?       @map("acknowledged_at")
  acknowledgedByUserId String?        @map("acknowledged_by_user_id") // user đã thao tác ký
  signatureImage      String?         @map("signature_image") @db.Text // PNG dataURL base64

  // ... index hiện có ...
  @@index([tenantId, ackStatus])
}
```

- Migration: `migrate dev --name asset_handover_ack`. `ackStatus` default `PENDING`; các assignment cũ →
  `PENDING` (không có chữ ký lịch sử) — chấp nhận được.
- **PII**: `signatureImage` là dữ liệu cá nhân → **không bao giờ log**, không trả trong list endpoint chung;
  chỉ trả ở detail biên bản / nhúng vào PDF.

### RBAC (`packages/shared/src/types/rbac.ts` + seed)
- Thêm action `acknowledge` vào `assets`: `assets: [..., 'acknowledge']`.
- Grants: `assets:acknowledge` → **EMPLOYEE** (ký phiếu của mình), MANAGER, HR_MANAGER, SUPER_ADMIN.
- Re-seed permission catalog + role grants (mirror cách SPEC-021 thêm `assets:*`).

### API contracts (`apps/api`)
Tất cả dưới `authenticate`. Trả `{ success, data }` / lỗi `{ success:false, error:{ code, message } }`.

| Method | Path | Permission | Ghi chú |
|--------|------|-----------|---------|
| POST | `/api/v1/assets/:id/assign` | `assets:assign` | **Mở rộng**: body thêm `signature?` (base64 PNG) + `ackMethod?`. Có chữ ký → tạo assignment `SIGNED` ngay; không → `PENDING`. |
| POST | `/api/v1/assets/assignments/:assignmentId/acknowledge` | `assets:acknowledge` | Người nhận (IN_APP) hoặc HR có `assets:assign` (ON_SCREEN muộn) gửi chữ ký → `PENDING`→`SIGNED`. Ownership: `assignment.employeeId` == employee của caller **hoặc** caller có `assets:assign`. 409 nếu đã `SIGNED` hoặc assignment không `ACTIVE`. |
| GET | `/api/v1/assets/assignments/:assignmentId/handover.pdf` | `assets:view` + (ownership ∨ `assets:assign`) | Trả `application/pdf`, `Content-Disposition: attachment`. |

- **Validator** (`asset.validator.ts`): `acknowledgeSchema = { signature: string (dataURL `data:image/png;base64,`),
  max ~200KB sau giải mã; ackMethod: z.enum(['ON_SCREEN','IN_APP']) }`. Mở rộng `assignAssetSchema` với
  `signature?`, `ackMethod?` (optional).
- **Transaction**: cập nhật `ackStatus/acknowledgedAt/acknowledgedByUserId/signatureImage/ackMethod` atomic.
- **PDF**: file mới `apps/api/src/domain/asset/handover.pdf.ts` theo khuôn `payslip.pdf.ts` (cùng font BVP).

### Frontend (`apps/web`)
- **Component mới** `SignaturePad` (`features/assets/components`): canvas HTML5 + pointer events
  (chuột + cảm ứng), `toDataURL('image/png')`; nút xoá/vẽ lại; `aria-label`; tôn trọng touch target ≥ 44px.
  **Không thêm dependency** — tự viết (~80 dòng), bám tech-decision discipline.
- `AssignAssetSheet`: thêm khu "Ký tại chỗ" (toggle) gắn `SignaturePad`; truyền `signature` + `ackMethod=ON_SCREEN`.
- `MyAssetsView`: thẻ "Phiếu chờ ký" + `AcknowledgeHandoverDialog` (IN_APP, gồm `SignaturePad`).
- `AssetAssignmentHistory`: badge trạng thái ký + nút "Xuất biên bản (PDF)" + (HR) nút lấy chữ ký cho phiếu `PENDING`.
- **Hooks** (`useAssets.ts`): `useAcknowledgeHandover()` (mutation, optimistic invalidate `assetKeys` + `/mine`),
  `useDownloadHandoverPdf()` (reuse `apiClient` + `saveBlob`/`filenameFromDisposition` như `useExportAssets`).
- **i18n**: bổ sung `asset.handover.*` (vi + en) — trạng thái, nhãn nút, dialog, toast, nhãn PDF.

### Code Style
- Tuân thủ `.claude/rules/*` (TS strict, 2-space, single quote, semicolons, ≤100 cols).
- Màu/spacing/radius theo token (CLAUDE.md + ui-modern) — không hardcode hex.
- RBAC: FE `<Can>` chỉ là UX; **server `requirePermission` + ownership check là bắt buộc** (non-negotiable).
- Không log `signatureImage`/PII.

## Testing Strategy (critical-path E2E, assert nghiệp vụ — không quote coverage%)
- **BE integration** (Supertest, DB thật):
  - Cấp phát kèm chữ ký → assignment `SIGNED`, ảnh chữ ký + `acknowledgedAt` lưu đúng.
  - Cấp phát không chữ ký → `PENDING`; sau đó người nhận `acknowledge` (IN_APP) → `SIGNED`.
  - Ownership: employee A ký phiếu của employee B → **403**.
  - Ký lại phiếu đã `SIGNED` → **409**; ký phiếu của assignment đã `RETURNED` → **409**.
  - Tenant isolation: không acknowledge / tải PDF biên bản tenant khác.
  - PDF endpoint trả `application/pdf`, status 200, body không rỗng (magic bytes `%PDF`).
- **FE unit** (Vitest + Testing Library):
  - `SignaturePad`: vẽ → `onChange` nhận dataURL; "xoá" → reset rỗng.
  - `MyAssetsView`: phiếu `PENDING` hiện nút "Ký xác nhận"; phiếu `SIGNED` không hiện.
  - `AssetAssignmentHistory`: badge "Đã ký"/"Chờ ký" + nút PDF render đúng theo `ackStatus`.
- **Verify thủ công** (preview, screenshot dark+light): ký ON_SCREEN khi cấp phát; ký IN_APP từ "Tài sản của
  tôi"; tải & mở biên bản PDF có chữ ký.

## Boundaries

### Always Do
- Server-side `requirePermission('assets:acknowledge')` + **ownership check** trên endpoint ký.
- Lưu danh tính (`acknowledgedByUserId`) + thời điểm (`acknowledgedAt`) + phương thức (`ackMethod`) mỗi lần ký.
- Tenant-scope mọi truy vấn assignment/PDF.
- Test UI bằng screenshot trước khi báo hoàn thành.

### Ask First
- Gửi **email/notification** nhắc người nhận ký (side-effect ra ngoài) — chưa làm nếu chưa được duyệt.
- Lưu chữ ký ra **object storage** ngoài DB.
- Thêm **dependency** ký (vd. `react-signature-canvas`) thay vì tự viết `SignaturePad`.

### Never Do
- Không log/trả `signatureImage` ở list endpoint hay log file.
- Không cho ký biên bản của người khác (trừ HR `assets:assign` chủ động lấy chữ ký tại chỗ).
- Không chặn quyền dùng tài sản vì chưa ký (assign-now/sign-later: ký là xác nhận, không phải điều kiện).
- Không commit (người dùng làm việc local, không có kế hoạch commit).

---

*Created: 2026-06-05 | Mở rộng SPEC-021 Fixed Assets | Maintained by: Đinh Văn Hạnh (hanhdinh@codecrush.asia)*
