# Plan: Asset Handover Acknowledgement & Signature (SPEC-022)

> Spec: `docs/specs/022-asset-handover-acknowledgement.md`
> Mở rộng SPEC-021 (`assets`). Vertical slices — mỗi slice ship một năng lực chạy thật end-to-end.

## Context — codebase đã khảo sát (read-only)

### Backend (`apps/api`)
- **Routes** `app/routes/v1/asset.routes.ts`: tất cả dưới `authenticate`; `/:id/assign` & `/:id/return`
  gated `assets:assign`. Thứ tự đặt route quan trọng — static path (`/mine`, `/export`) phải đứng **trước**
  `/:id`. Route assignment mới (`/assignments/:assignmentId/...`) cũng phải đứng trước `/:id` để không bị
  nuốt nhầm.
- **Controller** `app/controllers/asset.controller.ts`: `assign`/`returnAsset`/`listMine` dùng
  `requireActingEmployeeId(req)` (map user→employee). Trả `{ success, data }`.
- **Service** `domain/services/asset.service.ts`: `assign()` chạy trong `db.$transaction`, compare-and-set
  `AVAILABLE→ASSIGNED` rồi `createAssignment(...status:'ACTIVE')`. Bất biến "1 ACTIVE".
- **Repository** `domain/repositories/asset.repository.ts`: `createAssignment`, `releaseFromAssignment`,
  `findHeldBy`. Sẽ cần `findAssignmentById` + `updateAssignmentAck`.
- **Mapper** `domain/assets/mappers.ts`: `toAssignmentDto` — thêm các field ack ở đây (1 nơi, mọi endpoint
  trả assignment đều có). **KHÔNG** đưa `signatureImage` vào DTO list chung (PII) — chỉ field metadata
  (`ackStatus`/`ackMethod`/`acknowledgedAt`/`hasSignature`).
- **PDF** `domain/payroll/payslip.pdf.ts`: khuôn mẫu — `pdfkit` + font Be Vietnam Pro (`require.resolve`).
  Controller `getPayslipPdf`: set `Content-Type: application/pdf` + `Content-Disposition: attachment` +
  `res.send(buffer)`. Tái dùng nguyên pattern.

### Shared (`packages/shared/src/types`)
- `asset.ts`: `AssetAssignmentDto`, `AssignAssetInput`, `AssetDto.currentAssignment`, `AssetDetailDto`.
- `rbac.ts`: `PERMISSION_CATALOG.assets = [...,'export']` → thêm `'acknowledge'`.

### Frontend (`apps/web/src/features/assets`)
- `components/AssignAssetSheet.tsx` — form cấp phát (gắn SignaturePad ON_SCREEN).
- `components/MyAssetsView.tsx` — self-service "Tài sản của tôi" (thẻ "Phiếu chờ ký").
- `components/AssetAssignmentHistory.tsx` — render `assignments[]` (badge ký + nút PDF).
- `pages/AssetDetailPage.tsx` — host history tab + actions.
- `hooks/useAssets.ts` — assetKeys + mutations; `useExportAssets` là khuôn cho `useDownloadHandoverPdf`
  (apiClient blob + `saveBlob`/`filenameFromDisposition` từ `@/lib/download`).
- i18n: `apps/web/src/i18n/locales/{vi,en}/asset.json`.

## Decisions locked (từ spec)
1. Hai kịch bản ngang nhau: ON_SCREEN (canvas) + IN_APP (từ xa). 2. Cấp phát ngay, ký sau (PENDING→SIGNED).
3. PDF biên bản trong v1. 4. Lưu ảnh chữ ký + danh tính + phương thức + thời điểm.

## Dependency map
```
Phase 1 (foundation: enums+migration+shared+RBAC+mapper)
  ├─► Phase 2 (ON_SCREEN: assign + SignaturePad)        ┐
  ├─► Phase 3 (IN_APP: acknowledge + MyAssets dialog)   ├─ độc lập sau P1
  └─► Phase 4 (PDF + hiển thị trạng thái ký)            ┘  (P4 hiển thị badge cần P1; PDF độc lập)
        └─► Phase 5 (i18n + a11y + verify + /review)
```
Risk-first: Phase 2 chứa rủi ro cao nhất (SignaturePad canvas + đổi hợp đồng assign) → làm sớm.

---

## Phase 1 — Foundation (shared + DB + RBAC)

### Task 1.1 — Prisma: ack fields + enums + migration
**Objective**: AssetAssignment lưu được trạng thái/ảnh ký + danh tính + thời điểm.
**Files**: `apps/api/prisma/schema.prisma`
**Changes**: enum `AssetAckStatus {PENDING,SIGNED}`, `AssetAckMethod {ON_SCREEN,IN_APP}`; AssetAssignment +
`ackStatus @default(PENDING)`, `ackMethod?`, `acknowledgedAt?`, `acknowledgedByUserId?`,
`signatureImage? @db.Text`; `@@index([tenantId, ackStatus])`. `migrate dev --name asset_handover_ack`.
**Acceptance**: migration applied; assignment cũ → `PENDING`. **Verify**: `prisma generate` + typecheck.

### Task 1.2 — Shared types
**Objective**: FE/BE chung kiểu ack.
**Files**: `packages/shared/src/types/asset.ts` (+ `rbac.ts` ở 1.3)
**Changes**: const-objects `AssetAckStatus`/`AssetAckMethod`; mở rộng `AssetAssignmentDto` (+`ackStatus`,
`ackMethod|null`, `acknowledgedAt|null`, `acknowledgedByUserId|null`, `hasSignature:boolean`); mở rộng
`AssignAssetInput` (+`signature?:string|null`, `ackMethod?`); thêm `AcknowledgeHandoverInput {signature:string}`.
**Acceptance**: build `@hrm/shared` pass. **Depends**: —

### Task 1.3 — RBAC: assets:acknowledge + grants + re-seed
**Objective**: quyền ký xác nhận tồn tại & gán đúng role.
**Files**: `packages/shared/src/types/rbac.ts`, `apps/api/prisma/seed.ts` (role grants)
**Changes**: `assets: [...,'acknowledge']`; grant `assets:acknowledge` → EMPLOYEE, MANAGER, HR_MANAGER,
SUPER_ADMIN; re-seed.
**Acceptance**: seed chạy; EMPLOYEE có `assets:acknowledge`. **Verify**: query permission sau seed.

### Task 1.4 — Mapper: expose ack metadata (KHÔNG lộ signatureImage)
**Objective**: mọi endpoint trả assignment đều kèm metadata ký, không rò ảnh PII ở list.
**Files**: `apps/api/src/domain/assets/mappers.ts`
**Changes**: `toAssignmentDto` thêm `ackStatus/ackMethod/acknowledgedAt/acknowledgedByUserId`,
`hasSignature: a.signatureImage != null`. **Không** thêm `signatureImage` vào DTO.
**Acceptance**: typecheck pass; DTO không chứa ảnh. **Depends**: 1.1, 1.2

### ✅ Checkpoint: Foundation — migration applied, shared build xanh, EMPLOYEE có quyền acknowledge, typecheck pass.

---

## Phase 2 — Slice: HR ký tại chỗ khi cấp phát (ON_SCREEN) [RISK CAO]

### Task 2.1 — BE: assign nhận signature + ackMethod
**Objective**: cấp phát kèm chữ ký → assignment SIGNED ngay; không kèm → PENDING.
**Files**: `app/validators/asset.validator.ts` (mở rộng `assignAssetSchema`: `signature?`
`/^data:image\/png;base64,/` + giới hạn độ dài ~270KB ≈ 200KB nhị phân; `ackMethod?` enum),
`domain/services/asset.service.ts` (`assign` set ack khi có signature trong cùng `$transaction`),
`domain/repositories/asset.repository.ts` (`createAssignment` nhận thêm field ack),
`app/controllers/asset.controller.ts` (truyền `acknowledgedByUserId = req.user.sub` khi có signature).
**Acceptance**: assign + signature → `ackStatus=SIGNED`, `ackMethod=ON_SCREEN`, `acknowledgedAt`+ảnh lưu;
assign không signature → `PENDING`. **Depends**: Phase 1

### Task 2.2 — FE: SignaturePad component
**Objective**: vẽ chữ ký bằng chuột/cảm ứng → PNG dataURL.
**Files**: `features/assets/components/SignaturePad.tsx` (mới) — canvas + pointer events,
`onChange(dataUrl|null)`, nút "Vẽ lại", `aria-label`, container ≥ 44px touch, không thêm dependency.
**Acceptance**: vẽ → onChange dataURL; "Vẽ lại" → null. **Depends**: —

### Task 2.3 — FE: AssignAssetSheet "Ký tại chỗ" toggle
**Objective**: HR tuỳ chọn lấy chữ ký khi cấp phát.
**Files**: `features/assets/components/AssignAssetSheet.tsx`, `hooks/useAssets.ts` (useAssignAsset truyền
`signature`/`ackMethod`).
**Acceptance**: bật toggle + vẽ → submit gửi `signature`+`ackMethod=ON_SCREEN`; tắt → submit như cũ.
**Depends**: 2.1, 2.2

### Task 2.T — Tests slice 2
**Files**: BE integration `apps/api/.../asset*.test.ts` (assign+signature→SIGNED; assign no-sig→PENDING;
signature quá lớn→422); FE unit `SignaturePad.test.tsx` (+ AssignAssetSheet toggle render).
**Verify**: BE suite + FE suite xanh.

### ✅ Checkpoint: ON_SCREEN chạy thật — HR cấp phát kèm chữ ký, DB lưu SIGNED + ảnh; screenshot sheet có canvas.

---

## Phase 3 — Slice: EMPLOYEE ký xác nhận từ xa (IN_APP)

### Task 3.1 — BE: acknowledge endpoint + ownership + guards
**Objective**: người nhận (hoặc HR ON_SCREEN muộn) ký phiếu PENDING → SIGNED.
**Files**: `asset.validator.ts` (`acknowledgeHandoverSchema {signature}`), `asset.repository.ts`
(`findAssignmentById`, `updateAssignmentAck`), `asset.service.ts` (`acknowledgeHandover(assignmentId,
tenantId, caller, input)` — tenant-scope; ownership: `assignment.employeeId == caller.employeeId` **hoặc**
caller có `assets:assign`; 409 nếu đã SIGNED hoặc assignment !ACTIVE), `asset.controller.ts` (`acknowledge`),
`asset.routes.ts` (`POST /assignments/:assignmentId/acknowledge` gated `assets:acknowledge`, **đặt trước
`/:id`**; ownership check trong service vì requirePermission không biết ownership).
**Acceptance**: chủ phiếu ký → SIGNED+IN_APP+acknowledgedByUserId=self; ký phiếu người khác (không assign)
→403; ký lại →409; ký phiếu RETURNED →409; tenant khác →404. **Depends**: Phase 1

### Task 3.2 — FE: hook + "Phiếu chờ ký" trong MyAssetsView
**Objective**: self-service ký ≤ 2 chạm.
**Files**: `hooks/useAssets.ts` (`useAcknowledgeHandover` — invalidate assetKeys + `/mine`),
`features/assets/components/AcknowledgeHandoverDialog.tsx` (mới — info tài sản + SignaturePad + "Xác nhận đã
nhận"), `features/assets/components/MyAssetsView.tsx` (asset có `currentAssignment.ackStatus==='PENDING'` →
thẻ "Phiếu chờ ký" + nút mở dialog).
**Acceptance**: phiếu PENDING hiện nút; ký xong thẻ biến mất (optimistic/invalidate); phiếu SIGNED không hiện
nút. **Depends**: 3.1, 2.2

### Task 3.T — Tests slice 3
**Files**: BE integration (ownership 403; 409 đã ký / RETURNED; tenant isolation); FE unit
(`MyAssetsView`: PENDING→nút ký; SIGNED→không).
**Verify**: suites xanh.

### ✅ Checkpoint: IN_APP chạy thật — EMPLOYEE ký phiếu của mình từ "Tài sản của tôi"; screenshot mobile-width.

---

## Phase 4 — Slice: Biên bản PDF + hiển thị trạng thái ký

### Task 4.1 — BE: handover PDF
**Objective**: tải biên bản bàn giao PDF (nhúng chữ ký nếu đã ký).
**Files**: `apps/api/src/domain/asset/handover.pdf.ts` (mới — pdfkit + font BVP theo `payslip.pdf.ts`; khối
chữ ký: nhúng PNG nếu SIGNED + "Đã ký điện tử lúc …", để trống nếu PENDING), `asset.service.ts`
(`renderHandoverPdf(assignmentId, tenantId, caller)` — load assignment+asset+employee+tenant, ownership như
3.1, trả `{buffer, filename}`), `asset.controller.ts` (`getHandoverPdf` — set headers như `getPayslipPdf`),
`asset.routes.ts` (`GET /assignments/:assignmentId/handover.pdf` gated `assets:view`, **trước `/:id`**).
**Acceptance**: 200 `application/pdf`, body bắt đầu `%PDF`; SIGNED → có ảnh chữ ký + danh tính + thời điểm;
tiếng Việt + ₫ render đúng. **Depends**: Phase 1 (P3 cho ownership helper nếu tách chung)

### Task 4.2 — FE: nút "Xuất biên bản (PDF)" + badge trạng thái ký
**Objective**: thấy ai đã/chưa ký + tải biên bản.
**Files**: `hooks/useAssets.ts` (`useDownloadHandoverPdf` theo khuôn `useExportAssets`),
`features/assets/components/AssetAssignmentHistory.tsx` (badge "Đã ký"/"Chờ ký" + phương thức + thời điểm +
nút PDF; HR `assets:assign` mở phiếu PENDING để lấy chữ ký tại chỗ muộn → reuse AcknowledgeHandoverDialog).
**Acceptance**: badge đúng theo `ackStatus` (màu+chữ, a11y); nút PDF tải file; HR thấy nút "Lấy chữ ký" trên
phiếu PENDING. **Depends**: 4.1, 3.2

### Task 4.T — Tests slice 4
**Files**: BE integration (PDF 200 %PDF; perms: chủ phiếu tải được, người ngoài không); FE unit
(`AssetAssignmentHistory`: badge + nút PDF theo `ackStatus`/`hasSignature`).
**Verify**: suites xanh.

### ✅ Checkpoint: Feature complete — cả 2 luồng ký + PDF chạy thật.

---

## Phase 5 — Polish & verify

### Task 5.1 — i18n sweep vi/en
**Files**: `i18n/locales/{vi,en}/asset.json` — namespace `asset.handover.*` (status, nhãn nút, dialog, toast,
nhãn PDF), không hardcode text.

### Task 5.2 — A11y + responsive + dark/light + reduced-motion
SignaturePad: `aria-label`, touch ≥ 44px, không animate width/height; dialog Radix trap focus; badge có
màu+chữ; test 768–1440 + dark/light + `prefers-reduced-motion`.

### Task 5.3 — Browser verify + /review
preview: (a) HR cấp phát kèm chữ ký, (b) EMPLOYEE ký từ "Tài sản của tôi", (c) tải & mở biên bản PDF có chữ
ký — screenshot dark+light. Chạy `/review` five-axis. **Không quote coverage%** — assert nghiệp vụ.

### ✅ Checkpoint: Ship-ready — typecheck+lint+test xanh, screenshots, review pass. (KHÔNG commit.)

---

## Boundaries nhắc lại
- Server `requirePermission('assets:acknowledge')` + **ownership check** bắt buộc.
- Không log/trả `signatureImage` ngoài detail/PDF.
- Không chặn dùng tài sản vì chưa ký.
- **Ask First**: email nhắc ký · object storage cho chữ ký · thêm thư viện ký bên thứ ba.
- **Never commit.**
