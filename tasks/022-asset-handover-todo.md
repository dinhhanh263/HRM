# TODO: Asset Handover Acknowledgement & Signature (SPEC-022)

> Plan: `tasks/022-asset-handover-plan.md` · Spec: `docs/specs/022-asset-handover-acknowledgement.md`
> Vertical slices. KHÔNG commit.

## Phase 1 — Foundation (shared + DB + RBAC)
- [x] 1.1 Prisma: enums `AssetAckStatus`/`AssetAckMethod` + 5 field ack trên AssetAssignment + `@@index([tenantId, ackStatus])` → `migrate dev --name asset_handover_ack`
- [x] 1.2 Shared: const-objects + mở rộng `AssetAssignmentDto` (+`hasSignature`) + `AssignAssetInput` (+`signature`/`ackMethod`) + `AcknowledgeHandoverInput`
- [x] 1.3 RBAC: thêm `assets:acknowledge` vào catalog + grants (EMPLOYEE/MANAGER/HR_MANAGER/SUPER_ADMIN) → re-seed
- [x] 1.4 Mapper: `toAssignmentDto` expose ack metadata + `hasSignature` (KHÔNG lộ `signatureImage`)

### ✅ Checkpoint: migration applied · shared build xanh · EMPLOYEE có `assets:acknowledge` · typecheck pass

## Phase 2 — ON_SCREEN: HR ký tại chỗ khi cấp phát [RISK CAO]
- [x] 2.1 BE: mở rộng `assignAssetSchema` (`signature?`/`ackMethod?`) + `assign` set ack trong `$transaction` (có chữ ký → SIGNED/ON_SCREEN, `acknowledgedByUserId=req.user.sub`)
- [x] 2.2 FE: `SignaturePad` component (canvas + pointer events, "Vẽ lại", aria-label, touch ≥44px, no dependency)
- [x] 2.3 FE: `AssignAssetSheet` toggle "Ký tại chỗ" + `useAssignAsset` truyền signature/ackMethod
- [x] 2.T Tests: BE (assign+sig→SIGNED · no-sig→PENDING · sig quá lớn→422, 15/15 xanh) + FE (`SignaturePad` 3 + toggle 2, 5/5 xanh)

### ✅ Checkpoint: ON_SCREEN chạy thật — verified live: LP-TEST-03 → ASSIGNED + SIGNED/ON_SCREEN, chữ ký PNG lưu DB (4130 ký tự), DTO không lộ signatureImage

## Phase 3 — IN_APP: EMPLOYEE ký từ xa
- [x] 3.1 BE: `acknowledgeHandoverSchema` + repo (`findAssignmentById`/`updateAssignmentAck`) + service (ownership + 409 guards) + controller + route `POST /assignments/:assignmentId/acknowledge` (trước `/:id`, gated `assets:acknowledge`)
- [x] 3.2 FE: `useAcknowledgeHandover` + `AcknowledgeHandoverDialog` + thẻ "Phiếu chờ ký" trong `MyAssetsView`
- [x] 3.T Tests: BE (ownership 403 · 409 đã ký/RETURNED · tenant isolation, 21/21 xanh) + FE (`MyAssetsView` 2 + `AcknowledgeHandoverDialog` 2, asset components 13/13 xanh)

### ✅ Checkpoint: IN_APP chạy thật — verified live (mobile 375×812): employee ký phiếu PENDING, pending count 3→2, DB SIGNED/IN_APP + chữ ký PNG 8686 ký tự, DTO không lộ signatureImage

## Phase 4 — Biên bản PDF + hiển thị trạng thái ký
- [x] 4.1 BE: `domain/asset/handover.pdf.ts` (pdfkit + BVP, nhúng chữ ký) + `renderHandoverPdf` service + `findAssignmentForHandover` repo + `downloadHandoverPdf` controller + route `GET /assignments/:assignmentId/handover.pdf` (trước `/:id`, gated `assets:view` + ownership∨assign)
- [x] 4.2 FE: `useDownloadHandoverPdf` + `AssetAssignmentHistory` badge ký (PENDING/SIGNED) + method+signedAt + nút "Xuất biên bản (PDF)". (HR-ký-cho-phiếu-PENDING ĐÃ DESCOPE: `acknowledgeHandover` chặn ownership 403 → chỉ ON_SCREEN lúc cấp phát hoặc IN_APP người nhận tự ký mới ký được.)
- [x] 4.T Tests: BE (PDF 200 `%PDF` owner · HR-assign 200 · non-owner 403 · foreign-tenant 404 → 25/25 xanh) + FE (`AssetAssignmentHistory` 3/3: badge PENDING/SIGNED+method · nút Xuất gọi mutate đúng args)

### ✅ Checkpoint: Feature complete — verified live (HR): tab Lịch sử hiện badge "Chờ ký" + nút PDF trên phiếu PENDING; click → `GET handover.pdf 200 OK` trả PDF nhị phân ~27KB; render sạch cả light + dark

## Phase 5 — Polish & verify
- [x] 5.1 i18n sweep vi/en `asset.handover.*` (status/method/nút/dialog/toast/PDF/signedAt) — đầy đủ & song song 2 locale; `history.*` + top-level `condition.*`/`status.*` cũng đủ
- [x] 5.2 A11y + responsive 768–1440 + dark/light + reduced-motion — nút PDF có nhãn chữ (accessible name), badge dùng màu+chữ (không chỉ màu), reduced-motion xử lý global; layout sạch desktop light+dark
- [x] 5.3 Browser verify (HR live): PENDING → badge amber "Chờ ký"; SIGNED (LAPTOP-001/EMP-910 IN_APP) → badge xanh "Đã ký" + "Ký trên ứng dụng · Đã ký lúc …"; nút "Xuất biên bản (PDF)" mọi phiếu; tải PDF 200 OK ~27KB (verified Phase 4). `/review` five-axis = APPROVE (6 invariant đủ, chỉ NIT)

### ✅ Checkpoint: Ship-ready — typecheck+test xanh (BE 25/25 · FE asset 3/3), screenshots light+dark, /review APPROVE — KHÔNG commit

## Hậu-review fix (🟡 từ /review)
- [x] CAS cho `acknowledgeHandover`: repo `updateAssignmentAck(assignmentId, tenantId, data)` → `updateMany({where:{id,tenantId,status:'ACTIVE',ackStatus:'PENDING'}})` trả count; service giữ 4 pre-check (404/403/409×2) cho thông báo thân thiện, rồi gác bằng CAS — count!==1 → 409 ALREADY_ACKNOWLEDGED, re-fetch để build DTO. Đóng TOCTOU double-sign. Test race Promise.all (2 sign đồng thời → đúng 1×200 + 1×409). BE 26/26 xanh · typecheck pass — KHÔNG commit
