# Feature: Stage-transition policy — cổng gác chuyển bước hồ sơ tuyển dụng

> SPEC-028 · Bổ sung cho SPEC-024 (Recruitment ATS). Vá lỗ hổng logic: hồ sơ chuyển stage tự do, không có ràng buộc nghiệp vụ.

## Objective

Đặt một tầng **chính sách chuyển stage** (stage-transition policy) cho `applicationService.move()` để: (1) hồ sơ chỉ được vào stage `OFFER` khi đã có tín hiệu phỏng vấn thực sự (phỏng vấn hoàn tất + đánh giá), (2) cho phép vượt cổng có kiểm soát qua quyền riêng kèm lý do bắt buộc, và (3) chặn `move()` dùng làm đường tắt để đẩy hồ sơ vào stage kết thúc (`HIRED`/`REJECTED`).

## Vấn đề (root cause đã xác minh)

`applicationService.move()` ([application.service.ts:173-213](../../apps/api/src/domain/services/application.service.ts)) chỉ kiểm tra 4 điều kiện: actor có Employee · application `ACTIVE` · stage đích thuộc pipeline của job · stage đích ≠ stage hiện tại. **Không tồn tại** bất kỳ ràng buộc nghiệp vụ nào về thứ tự hay điều kiện cổng (đã grep toàn bộ `src/domain` + `src/app` — không có logic gating/ordering).

Hệ quả 2 lỗ hổng:

1. **INTERVIEW → OFFER không kiểm soát.** Hồ sơ đang ở stage `INTERVIEW` có thể nhảy thẳng sang `OFFER` dù: không có buổi phỏng vấn nào `COMPLETED`, không có scorecard nào submit. Frontend còn chủ động liệt kê **mọi** stage khác để chuyển tới ([JobPipelineBoard.tsx:124-132](../../apps/web/src/features/recruitment/components/JobPipelineBoard.tsx) — `otherStages`). Mất dấu vết quyết định tuyển dụng, không ai chịu trách nhiệm, audit không có gì để soi.

2. **`move()` lọt vào stage `HIRED`/`REJECTED`.** Pipeline bắt buộc có stage loại `HIRED` và `REJECTED` ([recruitment.validator.ts:38-43](../../apps/api/src/app/validators/recruitment.validator.ts)), mà `move()` chỉ cần "stage đích thuộc pipeline" → người dùng `move()` được hồ sơ thẳng vào stage type `HIRED`/`REJECTED` trong khi `status` vẫn `ACTIVE`, **bỏ qua hoàn toàn** `hire()`/`reject()` (không ghi `rejectionReason`, không tạo activity `HIRED`/`REJECTED`). Dữ liệu mâu thuẫn: hồ sơ "ở cột kết thúc" nhưng hệ thống coi là đang xử lý → analytics conversion/velocity sai.

> Đã loại trừ: không phải lỗi RBAC (route `move` gate đúng `recruitment:application_move`), không phải race condition (repo đã có compare-and-swap). Đây là **thiếu tầng chính sách nghiệp vụ**, không phải lỗi tầng dữ liệu.

## Triết lý thiết kế (mô hình 3 tầng)

Không hard-block tất cả (tuyển dụng thực tế lộn xộn → người dùng lách bằng dữ liệu giả, hỏng data tệ hơn), cũng không để tự do hoàn toàn:

| Tầng | Tính chất | Áp dụng |
|------|-----------|---------|
| **Invariant** (chặn cứng, không override) | Bất biến dữ liệu | `move()` không được vào stage type `HIRED`/`REJECTED` |
| **Gate** (chặn mềm, có đường override ghi vết) | Quy tắc nghiệp vụ | Vào `OFFER` yêu cầu ≥1 interview `COMPLETED` + ≥1 scorecard submitted |
| **Guidance** (UX) | Cảnh báo | FE disable mục OFFER khi chưa đủ + tooltip; người có quyền force thấy dialog nhập lý do |

## Target Users

- **HR Manager / Recruiter**: chuyển hồ sơ qua pipeline; là người được trao quyền force move (xử lý exec hire, referral mạnh bỏ qua vòng…).
- **Manager**: có `application_move` nhưng **không** có quyền force (không vượt được cổng OFFER).
- **Auditor / HR lead**: đọc stage history để truy vết ai vượt cổng, vì lý do gì.

## Core Features

1. **Policy: chặn `move()` vào stage kết thúc (Invariant)** — `move()` từ chối nếu `targetStage.type ∈ { HIRED, REJECTED }`, trả `ConflictError` mã `APPLICATION_MOVE_TO_TERMINAL` hướng dẫn dùng disposition (hire/reject).
   - **Acceptance:**
     - `move()` tới stage type `HIRED` → 409 `APPLICATION_MOVE_TO_TERMINAL`, không đổi stage, không ghi history.
     - `move()` tới stage type `REJECTED` → 409 tương tự.
     - `hire()`/`reject()` vẫn hoạt động bình thường (không bị ảnh hưởng).

2. **Policy: cổng OFFER yêu cầu tín hiệu phỏng vấn (Gate)** — khi `targetStage.type === 'OFFER'`, policy kiểm tra application có **≥1 interview `status=COMPLETED`** VÀ **≥1 scorecard đã submit** (`submittedAt != null`). Chưa đủ → `ConflictError` mã `APPLICATION_OFFER_GATE_UNMET` kèm thông điệp nêu rõ thiếu gì.
   - **Acceptance:**
     - App ở INTERVIEW, không interview COMPLETED → move OFFER bị chặn 409 `APPLICATION_OFFER_GATE_UNMET`.
     - App có interview COMPLETED nhưng 0 scorecard submitted → vẫn bị chặn.
     - App có ≥1 interview COMPLETED + ≥1 scorecard submitted → move OFFER thành công.
     - Gate **chỉ** áp cho stage type `OFFER`; chuyển sang SCREEN/ASSESSMENT/INTERVIEW không bị ràng buộc tín hiệu này.

3. **Override có kiểm soát (force move)** — thêm permission `recruitment:application_force_move`. Body `move` nhận thêm `force?: boolean`. Khi gate OFFER không đạt:
   - Actor **không** có quyền force → 409 như mục 2 (kể cả gửi `force=true`).
   - Actor **có** quyền force và gửi `force=true` → bắt buộc `note` không rỗng (lý do). Thiếu note → `ValidationError` `FORCE_MOVE_REASON_REQUIRED`. Đủ → move thành công, `note` ghi vào `ApplicationStageHistory.note` (đã có cột) + activity feed đánh dấu là chuyển bước có override.
   - **Acceptance:**
     - HR_MANAGER (có force) + `force=true` + note → vào OFFER được dù chưa đủ tín hiệu; stage history lưu lý do.
     - HR_MANAGER + `force=true` nhưng **thiếu note** → 422 `FORCE_MOVE_REASON_REQUIRED`.
     - MANAGER (không có force) + `force=true` → vẫn 409 `APPLICATION_OFFER_GATE_UNMET`.
     - `force` **không** vượt được Invariant ở mục 1 (force vào HIRED/REJECTED vẫn bị chặn).
     - Khi gate đã đạt, `force` thừa nhưng vô hại (move bình thường, không bắt buộc note).

4. **RBAC end-to-end cho permission mới** — `recruitment:application_force_move` thêm vào `PERMISSION_CATALOG` (shared) → seed catalog → cấp cho `SUPER_ADMIN` (wildcard, tự động) + `HR_MANAGER`. **Không** cấp cho MANAGER/EMPLOYEE. Route `move` đổi gate thành `requirePermission('recruitment:application_move')` (giữ nguyên — force là điều kiện trong service, không phải route riêng), service tự kiểm `force_move` qua danh sách permission của actor.
   - **Acceptance:** Roles matrix (FE) hiển thị permission mới; HR_MANAGER tick sẵn, MANAGER không có.

5. **Frontend: guidance + dialog override** — trong `JobPipelineBoard`:
   - Mục chuyển tới stage type `OFFER` bị **disable** (kèm tooltip "Cần hoàn tất phỏng vấn và đánh giá") khi application chưa đủ tín hiệu, **trừ khi** người dùng có `recruitment:application_force_move`.
   - Người có quyền force, khi chọn OFFER lúc chưa đủ điều kiện → mở dialog **bắt buộc nhập lý do** rồi mới gọi `move({ force: true, note })`.
   - Khi đủ điều kiện → chuyển bình thường (không dialog).
   - **Acceptance:** Recruiter thường không thấy đường vào OFFER khi hồ sơ chưa phỏng vấn; HR có quyền force thấy dialog yêu cầu lý do, nhập xong mới chuyển được.

## Out of Scope

- **Không** ép thứ tự stage tổng quát (không cấm nhảy cóc/lùi giữa các stage non-terminal khác) — chỉ gác cổng OFFER và 2 stage kết thúc. Ordering tổng quát để SPEC sau nếu cần.
- **Không** đổi luật scorecard/no-peek (`scorecardService` giữ nguyên).
- **Không** tự động đổi interview sang COMPLETED khi move (giữ luồng cập nhật status hiện có).
- **Không** đụng `hire()`/`reject()`/`withdraw()` ngoài việc đảm bảo chúng vẫn là đường hợp lệ duy nhất vào stage kết thúc.
- **Không** thêm gate cho ASSESSMENT/SCREEN (phạm vi lần này chỉ OFFER + terminal).

## Technical Approach

- **Shared** (`packages/shared/src/types/rbac.ts`): thêm `'application_force_move'` vào mảng `recruitment` của `PERMISSION_CATALOG` (tự động sinh `PermissionKey` + `PERMISSION_KEYS`).
- **RBAC catalog** (`apps/api/src/domain/rbac/catalog.ts`): thêm `'recruitment:application_force_move'` vào danh sách permission của `HR_MANAGER`. SUPER_ADMIN dùng `'*'` nên tự có. Re-seed qua `syncSystemRolesForTenant` (idempotent).
- **Policy thuần mới** (`apps/api/src/domain/recruitment/stage-transition.policy.ts`): hàm thuần, không I/O — nhận `{ targetStageType, signals: { hasCompletedInterview, hasSubmittedScorecard }, actorCanForce, force, note }` → trả `{ ok }` hoặc ném lỗi nghiệp vụ tương ứng (`APPLICATION_MOVE_TO_TERMINAL`, `APPLICATION_OFFER_GATE_UNMET`, `FORCE_MOVE_REASON_REQUIRED`). Tách thuần để unit-test trực tiếp, dễ phủ mọi nhánh.
- **Service** (`application.service.ts` `move()`): sau khi xác định `targetStage`, tải tín hiệu phỏng vấn qua repo (interview COMPLETED + scorecard submitted của application) và danh sách quyền actor; gọi policy; nếu pass mới gọi `applicationRepository.move()`. Cần resolve `actorCanForce` — dùng cơ chế kiểm permission hiện có (lấy permission set của user/role).
- **Repository**: dùng lại `scorecardRepository.listByApplication(applicationId)` (đã có) để biết có scorecard `submittedAt != null`; thêm/đùng truy vấn đếm interview `COMPLETED` theo application (interview.repository — thêm `countCompletedByApplication` hoặc `existsCompleted`). Tránh N+1: gộp 2 tín hiệu trong tối thiểu truy vấn.
- **Validator** (`recruitment.validator.ts`): `moveApplicationSchema` thêm `force: z.boolean().optional()`. (note đã có, max 500.)
- **Controller/Route**: route `move` giữ `requirePermission('recruitment:application_move')`; controller chuyển `force` xuống service; service tự kiểm `application_force_move`.
- **Frontend**:
  - `usePermission().can('recruitment:application_force_move')` để quyết định disable vs dialog.
  - `JobPipelineBoard`: cần biết tín hiệu phỏng vấn của từng app để disable OFFER. Lấy từ `ApplicationDto` mở rộng (thêm cờ `offerGateMet: boolean` vào DTO list-by-job để FE không phải gọi thêm) — quyết định: tính ở backend, trả kèm DTO để tránh round-trip.
  - Dialog nhập lý do tái dùng pattern `RejectApplicationDialog` (đã có) — tạo `ForceMoveDialog` tương tự, textarea lý do bắt buộc.
  - Hook `useMoveApplication` truyền thêm `force`, `note`.
  - i18n key mới ở namespace `recruitment` (vi + en): tooltip cổng, tiêu đề/label dialog lý do, thông điệp lỗi.

## Code Style

- Tuân thủ `.claude/rules/` (TS strict, error-handling qua `AppError`, không hardcode màu/permission key).
- Policy là pure function, không gọi DB — mọi I/O ở service.
- Lỗi nghiệp vụ dùng `ConflictError`/`ValidationError` có `code` ổn định để FE i18n.

## Testing Strategy

- **Unit** (`stage-transition.policy.test.ts`): phủ ma trận — terminal block; gate OFFER (4 tổ hợp signal × force × canForce); force thiếu note; force không vượt được terminal; gate non-OFFER bỏ qua.
- **Integration** (`recruitment.application.test.ts` mở rộng): seed job có pipeline đủ stage; tạo application ở INTERVIEW.
  - move OFFER khi chưa phỏng vấn → 409 `APPLICATION_OFFER_GATE_UNMET`.
  - seed interview COMPLETED + scorecard submitted → move OFFER 200.
  - move tới stage HIRED/REJECTED → 409 `APPLICATION_MOVE_TO_TERMINAL`.
  - HR_MANAGER force + note → 200, stage history có note; thiếu note → 422.
  - MANAGER force=true → 409 (không có quyền force).
- **E2E critical-path** (`recruitment-critical-path.spec.ts`): seed đủ state để **quan sát được kết quả nghiệp vụ** — recruiter thường không vào được OFFER khi hồ sơ chưa phỏng vấn (mục OFFER disabled); sau khi có interview COMPLETED + scorecard, chuyển OFFER thành công và thẻ xuất hiện ở cột OFFER.

## Boundaries

### Always Do
- Kiểm RBAC `application_force_move` ở **server** (route + service), không chỉ ẩn UI.
- Ghi `note` lý do vào `ApplicationStageHistory` mỗi lần force qua cổng — phải truy vết được.
- Giữ `hire()`/`reject()` là đường duy nhất vào stage kết thúc.

### Ask First
- Mở rộng gate sang stage type khác ngoài OFFER.
- Thay đổi ý nghĩa "đủ tín hiệu" (vd: yêu cầu tất cả interviewer nộp thay vì ≥1).

### Never Do
- Cho `force` vượt qua Invariant (move vào HIRED/REJECTED).
- Cấp `application_force_move` cho MANAGER/EMPLOYEE.
- Đổi interview/scorecard status như tác dụng phụ của move.

## Next Step

Sau khi spec được duyệt → chạy `/plan` để phân rã thành vertical slices theo thứ tự phụ thuộc (shared/RBAC → policy + unit test → service/repo → validator/route → DTO signal → FE).
