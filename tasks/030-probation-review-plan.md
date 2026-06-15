# Plan: SPEC-030 — Probation Review (Đánh giá thử việc)

> Nguồn: `docs/specs/030-probation-review.md` (Approved 2026-06-09)
> Quản lý đánh giá nhân viên thử việc bằng scorecard tiêu chí+điểm → đề xuất; HR ra quyết
> định cuối (CONFIRM/EXTEND/FAIL) với hệ quả tự động chạy trong **một** transaction.

---

## 1. Bối cảnh & chiến lược tái dùng

| Hạ tầng sẵn có | Quyết định cho Probation |
|----------------|--------------------------|
| Domain `leave` (routes→controller→service→repository + Zod) | **Mirror cấu trúc** sang `apps/api/src/domain/probation/` (+ services/validators/controllers/routes tương ứng) |
| `leave-type.service.ts` (CRUD config theo tenant) | **Mirror** cho `probation-criteria.service.ts` |
| `leave-request.service.ts` (state machine + scope) | **Mirror** mô hình cho `probation-review.service.ts` (KHÔNG dùng engine ApprovalFlow) |
| `contract.service.create()` — đã transactional, repo nhận `tx` | **Refactor nhẹ**: tách `createWithinTx(tx,…)` để `decide` gọi trong tx chung (Slice 2) |
| `employee.service.terminate()` — tự mở `db.$transaction`, chưa có `reason` | **Refactor nhẹ**: tách `terminateWithinTx(tx, id, tenantId, reason)` (Slice 2) |
| Reminder `probation_ending` (SPEC-017) | **Dùng nguyên**; chỉ thêm deep-link notification → `/probation` (Slice 7) |
| RBAC catalog + seed | **Mở rộng** thêm `probation:*` (Slice 1) |
| Feature web `leave` (TanStack Query, DataTable, Sheet, AlertDialog, RequirePermission) | **Mirror** sang `apps/web/src/features/probation/` |

**KHÔNG dùng** engine `ApprovalFlow`/`ApprovalStep` (probation cố định 2 bên manager→HR, mô hình bằng `status` machine).

## 2. Trạng thái hiện tại (đã verify)

- `Employee` (schema.prisma:431): có `probationEndDate?`, `contractType`, `status`, `managerId`, `terminatedAt`, `terminationReason`. Thêm 3 back-relation mới.
- `Contract` (schema.prisma:969): quy tắc ≤1 ACTIVE qua `contractRepository.expireActive(tx,…)`.
- `contract.service.create()` (contract.service.ts:50): `db.$transaction` gọi `expireActive(tx)` + `create(tx)` → repo đã nhận `tx`. ✅ refactor dễ.
- `employee.service.terminate()` (employee.service.ts:505): `db.$transaction(tx → user INACTIVE + employee TERMINATED)`; **chưa set `terminationReason`**, **chưa nhận `reason`/`tx`**.
- Routes mount: `app.ts:26 app.use('/api/v1', routes)` → `app/routes/index.ts` → từng `*.routes.ts` trong `app/routes/v1/`.
- Migration mới nhất: `20260607070208_bulk_cv_intake`.
- Shared types: mỗi feature 1 file `packages/shared/src/types/<feature>.ts` + export trong `index.ts`.
- Seed đơn: `apps/api/prisma/seed.ts` (`seedPermissionCatalog`, `syncSystemRolesForTenant`).

## 3. Mô hình quyết định (chốt từ spec)

- State machine: `DRAFT → PENDING_HR → DECIDED` (+ `CANCELLED`). Outcome `{CONFIRM, EXTEND, FAIL}`.
- Tối đa **1 review mở** (`DRAFT|PENDING_HR`) / nhân viên (enforce ở service + check tạo).
- MANAGER scope: chỉ nhân viên `managerId = mình` (trực tiếp); enforce **server-side**.
- HR **không sửa scorecard** (bất biến sau submit), chỉ quyết định.
- `decide`: CONFIRM/EXTEND/FAIL chạy trong **một** `db.$transaction` (dùng service tx-aware từ Slice 2).
- Xóa tiêu chí đã được review tham chiếu → **chặn**, chỉ deactivate.

---

## 4. Vertical slices (foundation-first, risk-first)

### Slice 1 — Schema + shared types + migration  (FOUNDATION)
**Mục tiêu:** DB & type nền sẵn sàng; build/tsc pass; chưa đổi hành vi runtime.

Files:
- `apps/api/prisma/schema.prisma`:
  - `enum ProbationReviewStatus { DRAFT PENDING_HR DECIDED CANCELLED }`
  - `enum ProbationOutcome { CONFIRM EXTEND FAIL }`
  - model `ProbationCriteria` (tenantId, name, order, isActive, timestamps; `@@index([tenantId, isActive])`, `@@map("probation_criteria")`)
  - model `ProbationReview` (theo spec §Data Model: reviewer/decidedBy/employee relations, ratings Json, recommendation, decision, newProbationEndDate, probationEndDateAtCreate; `@@index([tenantId, status])`, `@@index([employeeId])`, `@@map("probation_reviews")`)
  - back-relation trên `Employee`: `probationReviews`, `probationReviewsGiven` (reviewer), `probationReviewsDecided` (decidedBy); trên `Tenant`: `probationCriteria`, `probationReviews`.
- Migration: `pnpm --filter @hrm/api prisma migrate dev --name probation_review`.
- `packages/shared/src/types/probation.ts` (mới): `ProbationReviewStatus`, `ProbationOutcome`, `ProbationCriteriaDto`, `ProbationReviewDto`, `ProbationReviewListItemDto`, request types (Create/UpdateCriteria, CreateReview, PatchReview, SubmitReview, DecideReview). Export trong `packages/shared/src/types/index.ts`.

**AC / Verify:**
- [ ] `pnpm build` + `tsc` pass toàn workspace
- [ ] `prisma migrate dev` chạy sạch, `prisma generate` ok
- [ ] Seed RBAC hiện có không vỡ

**Dependencies:** none.

---

### Slice 2 — Atomicity refactor (RISK-FIRST, no behavior change)
**Mục tiêu:** Cho `contract.service` và `employee.service.terminate` chạy trong tx do bên ngoài cung cấp, để `decide` (Slice 6) atomic. **Không nhân bản logic, không đổi hành vi public.**

Files:
- `apps/api/src/domain/services/contract.service.ts`: tách phần thân trong `db.$transaction` của `create()` thành `createWithinTx(tx, employeeId, tenantId, input)`; `create()` công khai = `db.$transaction(tx => createWithinTx(tx, …))`. (validation endDate<startDate giữ trước tx.)
- `apps/api/src/domain/services/employee.service.ts`: thêm `terminateWithinTx(tx, id, tenantId, reason?)` set `status=TERMINATED, terminatedAt, terminationReason=reason ?? null` + `user.status=INACTIVE`; `terminate(id, tenantId, reason?)` công khai = `db.$transaction(tx => terminateWithinTx(tx, …))`. (Giữ guard "đã TERMINATED" trước tx.)

**AC / Verify:**
- [ ] Test cũ của contract/employee vẫn pass (hành vi public không đổi)
- [ ] `terminate` set `terminationReason` khi truyền `reason`
- [ ] Unit test mới: gọi `createWithinTx`/`terminateWithinTx` trong 1 tx ngoài → commit/rollback đúng (rollback toàn bộ khi 1 bước lỗi)

**Dependencies:** Slice 1 (types).

---

### Checkpoint A — Foundation
- [ ] Build/tsc/migrate sạch; RBAC seed ok; refactor tx không gây regression (chạy `pnpm --filter @hrm/api test`).

---

### Slice 3 — RBAC: thêm `probation:*`  (FOUNDATION)
**Mục tiêu:** Permission khai báo end-to-end; guard BE + `can()` FE dùng được.

Files:
- `packages/shared/src/types/rbac.ts`: thêm `probation: ['view','review','decide','configure']` vào `PERMISSION_CATALOG`.
- `apps/api/src/domain/rbac/catalog.ts`: HR_MANAGER += cả 4; MANAGER += `probation:view`, `probation:review`; (SUPER_ADMIN `*` đã bao).
- Seed: chạy lại để upsert permission + sync system roles.
- `apps/web/src/i18n/locales/{vi,en}/permission.json`: nhãn cho probation actions (matrix Roles).

**AC / Verify:**
- [ ] `PERMISSION_KEYS` chứa 4 key mới; `tsc` pass
- [ ] Seed upsert 4 permission, gán đúng HR_MANAGER/MANAGER
- [ ] Roles matrix (web) hiển thị nhóm "probation"

**Dependencies:** Slice 1.

---

### Slice 4 — Tiêu chí đánh giá (ProbationCriteria) CRUD  (VERTICAL)
**Mục tiêu:** HR cấu hình bộ tiêu chí; seed bộ mặc định cho tenant.

Files (BE):
- `apps/api/src/domain/probation/` (mappers nếu cần), `apps/api/src/domain/services/probation-criteria.service.ts` (mirror leave-type.service): getAll(tenant, {activeOnly}), create, update, remove (**chặn remove nếu được review tham chiếu** → BadRequest, gợi ý deactivate).
- repository: `apps/api/src/domain/repositories/probation-criteria.repository.ts`.
- `apps/api/src/app/validators/probation.validator.ts`: `createCriteriaSchema`, `updateCriteriaSchema`.
- `apps/api/src/app/controllers/probation.controller.ts` (phần criteria).
- `apps/api/src/app/routes/v1/probation.routes.ts`: `GET /criteria` (`probation:view`), `POST/PATCH/DELETE /criteria` (`probation:configure`). Mount trong `app/routes/index.ts`.
- Seed: bộ tiêu chí mặc định khi tạo tenant (vd Chuyên môn, Thái độ/Kỷ luật, Hòa nhập, Hiệu suất).

Files (FE):
- `apps/web/src/features/probation/hooks/useProbationCriteria.ts` (TanStack Query keys + CRUD mutations, optimistic + invalidate).
- Tab cấu hình tiêu chí (pattern LeaveType settings): list + thêm/sửa/toggle active/sắp xếp.
- i18n `apps/web/src/i18n/locales/{vi,en}/probation.json` (criteria section).

**AC / Verify:**
- [ ] CRUD tiêu chí gate đúng permission; tenant-scoped
- [ ] DELETE tiêu chí đã dùng → bị chặn (chỉ deactivate)
- [ ] Tenant mới có bộ tiêu chí mặc định
- [ ] Unit test service (create/update/remove-blocked); integration RBAC

**Dependencies:** Slice 1, 2(types), 3.

---

### Slice 5 — Danh sách review + tạo review (draft)  (VERTICAL)
**Mục tiêu:** Thấy nhân viên đang thử việc, MANAGER/HR tạo review (DRAFT) với scope + 1-open.

Files (BE):
- `probation-review.service.ts`: `list(requester, filters)` (MANAGER → chỉ `managerId=mình`; HR/SUPER_ADMIN → toàn tenant; filter status/department); `getById`; `create(requester, {employeeId})` — kiểm tra nhân viên đang TV (`contractType=PROBATION || probationEndDate!=null`, `status=ACTIVE`), scope MANAGER, chặn nếu đã có review mở; snapshot `probationEndDateAtCreate`.
- repository: `probation-review.repository.ts`.
- validator: `createReviewSchema`; controller + routes `GET /reviews`, `GET /reviews/:id`, `POST /reviews` (`probation:review`).

Files (FE):
- `useProbationReviews.ts` hooks.
- Trang `apps/web/src/features/probation/pages/ProbationPage.tsx`: DataTable (nhân viên+avatar, phòng ban, ngày hết TV/còn N ngày `tabular-nums`, status badge màu+chữ, đề xuất, quyết định), toolbar search + filter status; skeleton/empty/error; nút "Tạo đánh giá".
- Route `/probation` bọc `<RequirePermission permission="probation:view">` trong `router.tsx`; thêm nav item (ẩn/hiện theo `can('probation:view')`).

**AC / Verify:**
- [ ] MANAGER chỉ thấy/tạo cho nhân viên dưới quyền (server-enforced); HR thấy tất cả
- [ ] Chặn tạo khi đã có review mở; chỉ cho nhân viên đang TV
- [ ] Trang hiển thị đúng, skeleton/empty/error; nav ẩn khi không có quyền
- [ ] Unit test scope + 1-open; integration RBAC (EMPLOYEE → 403)

**Dependencies:** Slice 1, 3, 4.

---

### Slice 6 — Scorecard: chấm điểm + nộp (MANAGER)  (VERTICAL)
**Mục tiêu:** Manager nhập scorecard (1–5), lưu nháp, nộp (PENDING_HR).

Files (BE):
- `probation-review.service.ts`: `patch(requester, id, input)` (chỉ DRAFT, đúng người tạo/HR; cập nhật ratings/strengths/weaknesses/comment/recommendation/newProbationEndDate); `submit(requester, id)` (validate: chấm đủ tiêu chí active + có recommendation; EXTEND ⇒ newProbationEndDate>hôm nay → `PENDING_HR`, khóa sửa).
- validator: `patchReviewSchema`, `submitReviewSchema` (ratings record id→1..5).
- routes: `PATCH /reviews/:id` (`probation:review`), `POST /reviews/:id/submit` (`probation:review`).

Files (FE):
- **Sheet** form scorecard: render tiêu chí active + chấm 1–5, ô nhận xét, chọn đề xuất, field ngày mới khi EXTEND. Nút "Lưu nháp" + "Nộp". RHF + Zod.
- i18n probation.json (form + validation).

**AC / Verify:**
- [ ] Lưu nháp nhiều lần; nộp khóa chỉnh sửa của manager
- [ ] Nộp bị chặn nếu thiếu điểm/recommendation; EXTEND yêu cầu ngày hợp lệ
- [ ] Không sửa được khi PENDING_HR/DECIDED
- [ ] Unit test validate submit; component test form (golden + thiếu điểm)

**Dependencies:** Slice 5.

---

### Slice 7 — HR ra quyết định + hệ quả (decide)  (VERTICAL, atomic)
**Mục tiêu:** HR chốt; chạy CONFIRM/EXTEND/FAIL trong MỘT transaction (tái dùng Slice 2).

Files (BE):
- `probation-review.service.ts`: `decide(requester, id, {decision, decisionNote, newProbationEndDate?})` — chỉ `PENDING_HR`; trong `db.$transaction`:
  - CONFIRM → `contract.service.createWithinTx(tx, employeeId, tenantId, {type:'FULL_TIME', status:'ACTIVE', startDate: today})` + set `employee.contractType=FULL_TIME` + review DECIDED.
  - EXTEND → `employee.probationEndDate = newProbationEndDate` (bắt buộc, >hôm nay) + review DECIDED.
  - FAIL → `employee.service.terminateWithinTx(tx, employeeId, tenantId, decisionNote)` + review DECIDED.
  - ghi `decidedById`, `decidedAt`, `decision`, `decisionNote`.
- `cancel(requester, id)` (review chưa DECIDED).
- validator `decideReviewSchema`; routes `POST /reviews/:id/decide` (`probation:decide`), `POST /reviews/:id/cancel` (`probation:review|decide`).

Files (FE):
- Màn chi tiết review (đọc scorecard của manager — HR không sửa) + nút quyết định.
- **AlertDialog** xác nhận; FAIL cảnh báo "không hoàn tác — nhân viên sẽ nghỉ việc".
- Hooks `useDecideReview`, `useCancelReview` (invalidate list + detail).

**AC / Verify:**
- [ ] Chỉ HR/SUPER_ADMIN decide; MANAGER → 403
- [ ] CONFIRM tạo Contract FULL_TIME + employee.contractType=FULL_TIME (1-ACTIVE giữ đúng)
- [ ] EXTEND đẩy probationEndDate; reminder nhắc lại theo ngày mới (dedupe key)
- [ ] FAIL terminate + set terminationReason=decisionNote
- [ ] **Atomic**: lỗi giữa chừng → rollback toàn bộ (test rollback)
- [ ] HR không sửa được scorecard

**Dependencies:** Slice 2, 6.

---

### Checkpoint B — Core complete
- [ ] Luồng đầy đủ: tạo → scorecard → nộp → HR decide (cả 3 nhánh) chạy đúng & atomic.
- [ ] RBAC server-side đúng cho mọi role; coverage critical path ok.

---

### Slice 8 — Reminder deep-link  (INTEGRATION)
**Mục tiêu:** Nối thông báo sẵn có tới màn review.

Files:
- Notification builder của reminder `probation_ending` (reminders.scan / notification record) → thêm link `/probation` (hoặc `/probation?employeeId=`).
- (Tùy chọn, ưu tiên thấp) reminder/notification cho HR khi có review `PENDING_HR`.

**AC / Verify:**
- [ ] Notification probation_ending click mở `/probation`
- [ ] Không phá dedupe/idempotency hiện có

**Dependencies:** Slice 5.

---

### Slice 9 — Polish + E2E  (POLISH)
**Mục tiêu:** Hoàn thiện UX & kiểm thử critical path.

Files:
- Đảm bảo skeleton/empty/error đầy đủ; status badge màu+chữ; dark mode; token (no hex); `tabular-nums`; a11y (aria-label icon button, label input, focus-visible); responsive 768–1440.
- i18n vi+en đầy đủ; đăng ký namespace `probation` trong `i18n/index.ts`.
- E2E Playwright: manager đánh giá → nộp → HR CONFIRM → assert nhân viên có Contract FULL_TIME (seed đủ state; assert kết quả nghiệp vụ, không chỉ coverage).

**AC / Verify:**
- [ ] E2E critical path xanh
- [ ] Design checklist + Modern UI checklist (CLAUDE.md) pass
- [ ] Test với screenshot trước khi báo done

**Dependencies:** Slice 7.

---

## 5. Thứ tự thực thi (dependency graph)

```
1 (schema/types) ─┬─ 2 (tx refactor) ──────────────┐
                  └─ 3 (RBAC) ── 4 (criteria) ── 5 (list+create) ── 6 (scorecard+submit) ── 7 (decide) ─┬─ 9 (polish+E2E)
                                                     └────────────── 8 (reminder deep-link) ─────────────┘
```
Foundation: 1 → 2 → (Checkpoint A) → 3. Core: 4 → 5 → 6 → 7 (Checkpoint B). Integration/Polish: 8, 9.

## 6. Ràng buộc xuyên suốt (mọi slice)
- Tenant-scoped tuyệt đối; RBAC server-side (đặc biệt scope MANAGER).
- Mọi đổi trạng thái + hệ quả trong transaction.
- TDD: RED→GREEN→REFACTOR; test critical path assert kết quả nghiệp vụ (không quote coverage%).
- WCAG AA, dark mode, i18n vi+en, design token (no hex). Không commit (làm local).
