# SPEC-030: Probation Review (Đánh giá thử việc)

**Status:** Approved (discovery resolved 2026-06-09)
**Created:** 2026-06-09
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee Management), SPEC-003 (Authorization/RBAC), SPEC-017 (Employee Lifecycle Reminders), SPEC-024/025 (Recruitment Scorecard pattern), Contract management (model Contract đã có)

---

## Objective

Cho phép **quản lý** đánh giá nhân viên trong thời gian thử việc bằng **scorecard có
tiêu chí + điểm** và đề xuất kết quả; **HR** xem đề xuất và **ra quyết định cuối**
(Chính thức / Gia hạn / Không đạt). Khi HR quyết định, hệ thống **tự động chạy hệ quả**
trong một transaction (tạo hợp đồng chính thức / đẩy ngày hết thử việc / cho nghỉ việc).

## Vấn đề với hiện trạng

- Hệ thống đã **nhắc** "sắp hết thử việc" (SPEC-017, trước 7 ngày, email + in-app) nhưng
  **dừng ở đó** — không có nơi ghi đánh giá, không có quyết định, không có lịch sử.
- `Employee.probationEndDate`, `ContractType.PROBATION`, model `Contract` đã tồn tại nhưng
  rời rạc; việc "chuyển nhân viên thử việc thành chính thức" hiện là thao tác tay, không
  có audit trail, không gắn với đánh giá của quản lý.

## Quyết định discovery (đã chốt 2026-06-09)

1. **Scorecard có tiêu chí + điểm** — tái dùng *pattern* Scorecard của recruitment
   (`ratings Json {criteriaId: điểm}` + recommendation + notes). Tiêu chí **cấu hình
   theo tenant** qua model mới `ProbationCriteria` (mirror `LeaveType`). **Thang điểm 1–5.**
2. **Workflow 2 bước cố định** — MANAGER đánh giá + đề xuất (chỉ nhân viên **dưới quyền**)
   → HR_MANAGER xem và **ra quyết định cuối**. Đây là luồng **2 bên cố định** (không dùng
   engine `ApprovalFlow` cấu hình được của Leave/OT — xem Out of scope), mô hình bằng
   `status` machine trên `ProbationReview`.
3. **Hệ quả tự động khi HR `decide` (một transaction):**
   - **CONFIRM (Chính thức):** tạo `Contract` ACTIVE FULL_TIME (tái dùng logic
     contract.service) + set `employee.contractType = FULL_TIME`.
   - **EXTEND (Gia hạn):** set `employee.probationEndDate = newProbationEndDate` →
     reminder `probation_ending` sẵn có **tự nhắc lại** theo ngày mới (dedupe key đã hỗ trợ).
   - **FAIL (Không đạt):** cho nghỉ việc (status `TERMINATED`, `terminatedAt`,
     `terminationReason`) — tái dùng logic terminate của employee.service.
4. **EMPLOYEE KHÔNG có quyền** xem kết quả review của mình (không self-view ở iteration này).
5. **Permissions mới** `probation:['view','review','decide','configure']`.
   - HR_MANAGER: cả 4 · MANAGER: `view` + `review` (scope nhân viên dưới quyền) · SUPER_ADMIN: `*`.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Toàn quyền; cấu hình tiêu chí; xem/quyết định mọi review |
| **HR Manager** | Cấu hình tiêu chí (`probation:configure`); xem mọi review; **ra quyết định cuối** (`probation:decide`) |
| **Manager / Trưởng phòng** | Tạo & nộp đánh giá scorecard cho **nhân viên dưới quyền** (`probation:review`); xem review mình tạo |
| **Employee** | **Không** truy cập (không self-view) |

---

## Core Features

### 1. Cấu hình bộ tiêu chí (ProbationCriteria), theo tenant
**Acceptance Criteria:**
- [ ] CRUD tiêu chí: `name`, `order` (sắp xếp), `isActive`; gate `probation:configure`
- [ ] Soft toggle `isActive` (ẩn khỏi form mới, giữ dữ liệu review cũ tham chiếu được)
- [ ] Tenant-scoped tuyệt đối; seed một bộ tiêu chí mặc định hợp lý cho tenant mới
      (vd: Chuyên môn, Thái độ/Kỷ luật, Hòa nhập, Hiệu suất công việc)

### 2. Khởi tạo review cho nhân viên đang thử việc
**Acceptance Criteria:**
- [ ] Danh sách nhân viên **đang thử việc** = `contractType=PROBATION` hoặc `probationEndDate != null`, `status=ACTIVE`
- [ ] MANAGER chỉ thấy/khởi tạo review cho nhân viên **dưới quyền** (`managerId` = mình, đệ quy không bắt buộc — trực tiếp); HR thấy toàn tenant
- [ ] Tối đa **1 review đang mở** (`DRAFT`/`PENDING_HR`) cho mỗi nhân viên tại một thời điểm
- [ ] Review nhớ `probationEndDate` tại thời điểm tạo (hiển thị "còn N ngày")

### 3. Đánh giá scorecard + đề xuất (MANAGER)
**Acceptance Criteria:**
- [ ] Form scorecard: mỗi tiêu chí active chấm **1–5**; ô `strengths`, `weaknesses`, `comment`
- [ ] Chọn **đề xuất** `recommendation` ∈ {CONFIRM, EXTEND, FAIL}; nếu EXTEND yêu cầu **đề xuất ngày mới** (`newProbationEndDate` > hôm nay)
- [ ] **Lưu nháp** (`DRAFT`) — sửa nhiều lần; **Nộp** (`PENDING_HR`) khóa chỉnh sửa của manager, mở cho HR
- [ ] Validation: nộp phải chấm đủ tiêu chí active + có recommendation; server-side (Zod) + client (RHF/Zod)
- [ ] Chỉ người tạo (hoặc HR) sửa được review `DRAFT`; không sửa khi đã `PENDING_HR`/`DECIDED`

### 4. HR ra quyết định cuối + hệ quả tự động
**Acceptance Criteria:**
- [ ] HR (`probation:decide`) xem review `PENDING_HR` (scorecard, đề xuất của manager) và chọn `decision` ∈ {CONFIRM, EXTEND, FAIL} + `decisionNote`
- [ ] HR **không bị ràng buộc** theo đề xuất của manager (có thể quyết khác); ghi cả `recommendation` lẫn `decision` để audit
- [ ] **CONFIRM:** trong transaction → tạo `Contract` (type FULL_TIME, status ACTIVE, startDate = hôm nay; tự EXPIRE hợp đồng ACTIVE cũ theo quy tắc 1-ACTIVE) + set `employee.contractType=FULL_TIME` + `review.status=DECIDED`
- [ ] **EXTEND:** trong transaction → `employee.probationEndDate = decision.newProbationEndDate` (bắt buộc, > hôm nay) + `review.status=DECIDED`
- [ ] **FAIL:** trong transaction → `employee.status=TERMINATED`, `terminatedAt=now`, `terminationReason=decisionNote`, `user.status=INACTIVE` + `review.status=DECIDED`
- [ ] Không `decide` review không ở `PENDING_HR`; toàn bộ hệ quả **atomic** (mọi-hoặc-không)
- [ ] Ghi `decidedById`, `decidedAt`

### 5. Nối reminder & notification sẵn có
**Acceptance Criteria:**
- [ ] Notification `probation_ending` (SPEC-017) **deep-link** tới `/probation` (màn review của nhân viên đó)
- [ ] (Tùy chọn, ưu tiên thấp) thêm reminder/notification cho HR khi có review `PENDING_HR` chờ quyết định
- [ ] Sau `decide`, review không còn xuất hiện ở danh sách "cần xử lý"

### 6. UI (web)
**Acceptance Criteria:**
- [ ] Trang `/probation`: DataTable (nhân viên + avatar, phòng ban, ngày hết TV/còn N ngày, trạng thái review badge, đề xuất, quyết định), toolbar search + filter trạng thái, skeleton/empty/error
- [ ] **Sheet** form đánh giá scorecard (tiêu chí + điểm 1–5, nhận xét, đề xuất) — không dùng Dialog
- [ ] **AlertDialog** xác nhận khi HR ra quyết định (đặc biệt FAIL: cảnh báo "không hoàn tác — nhân viên sẽ nghỉ việc")
- [ ] Tab cấu hình tiêu chí (HR) — pattern giống cấu hình LeaveType
- [ ] Route bọc `<RequirePermission permission="probation:view">`; nav item ẩn/hiện theo `can('probation:view')`
- [ ] i18n namespace mới `probation` (vi + en); status badge **màu + chữ**; dark mode; design token (no hex); `tabular-nums` cho cột số/ngày

---

## Data Model (bổ sung — Prisma)

```prisma
model ProbationCriteria {              // bộ tiêu chí cấu hình theo tenant (mirror LeaveType)
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  name      String
  order     Int      @default(0)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive])
  @@map("probation_criteria")
}

model ProbationReview {
  id              String  @id @default(cuid())
  tenantId        String  @map("tenant_id")
  employeeId      String  @map("employee_id")
  status          ProbationReviewStatus @default(DRAFT)

  // -- Manager đánh giá (scorecard) --
  reviewerId      String?  @map("reviewer_id")
  ratings         Json?    // { [criteriaId]: 1..5 }
  strengths       String?
  weaknesses      String?
  comment         String?
  recommendation  ProbationOutcome?       // đề xuất của manager
  submittedAt     DateTime? @map("submitted_at")

  // -- HR quyết định --
  decidedById     String?  @map("decided_by_id")
  decision        ProbationOutcome?       // quyết định cuối
  decisionNote    String?  @map("decision_note")
  decidedAt       DateTime? @map("decided_at")
  newProbationEndDate DateTime? @map("new_probation_end_date") // chỉ khi EXTEND

  // snapshot ngày hết TV tại lúc tạo, để hiển thị/audit
  probationEndDateAtCreate DateTime? @map("probation_end_date_at_create")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation("EmployeeProbationReviews", fields: [employeeId], references: [id], onDelete: Cascade)
  reviewer Employee? @relation("ProbationReviewer", fields: [reviewerId], references: [id])
  decidedBy Employee? @relation("ProbationDecider", fields: [decidedById], references: [id])

  @@index([tenantId, status])
  @@index([employeeId])
  @@map("probation_reviews")
}

enum ProbationReviewStatus { DRAFT PENDING_HR DECIDED CANCELLED }
enum ProbationOutcome      { CONFIRM EXTEND FAIL }
```

> Bổ sung back-relation trên `Employee`: `probationReviews`, `probationReviewsGiven`,
> `probationReviewsDecided`; và trên `Tenant`. Không đổi field cũ của Employee/Contract.

## API (dưới `/api/v1/probation`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/criteria` | `probation:view` | list tiêu chí (HR: kèm inactive) |
| POST | `/criteria` | `probation:configure` | tạo tiêu chí |
| PATCH | `/criteria/:id` | `probation:configure` | sửa tên/order/isActive |
| DELETE | `/criteria/:id` | `probation:configure` | **chặn xóa nếu đã được review tham chiếu** (chỉ cho deactivate); xóa cứng chỉ khi chưa dùng |
| GET | `/reviews` | `probation:view` | list; MANAGER bị giới hạn nhân viên dưới quyền; filter status/department; `scope` |
| GET | `/reviews/:id` | `probation:view` | chi tiết scorecard + quyết định |
| POST | `/reviews` | `probation:review` | tạo review cho 1 nhân viên đang TV (kiểm tra scope + 1-open) |
| PATCH | `/reviews/:id` | `probation:review` | lưu nháp / sửa scorecard (chỉ DRAFT, đúng người tạo/HR) |
| POST | `/reviews/:id/submit` | `probation:review` | DRAFT → PENDING_HR (validate đủ điểm + recommendation) |
| POST | `/reviews/:id/decide` | `probation:decide` | PENDING_HR → DECIDED + chạy hệ quả (transaction) |
| POST | `/reviews/:id/cancel` | `probation:review`/`decide` | hủy review chưa DECIDED |

- Mọi route `authenticate`; tenant-scoped; MANAGER scope check ở **service** (không chỉ ẩn UI).

## Điểm kỹ thuật về Atomicity (quan trọng — phải xử lý ở /plan)

`employee.service.terminate()` và `contract.service.create()` **hiện tự mở
`db.$transaction` riêng** và `terminate()` **không set `terminationReason`**. Gọi trực
tiếp chúng bên trong transaction của `decide` sẽ gây **transaction lồng nhau**.

**Chiến lược (chốt ở /plan):** refactor nhẹ để các thao tác này nhận **Prisma tx client
tùy chọn** (và `terminate` nhận thêm `reason`), rồi `probation.service.decide` bọc tất
cả trong **một** `db.$transaction`. Không nhân bản logic 1-ACTIVE-contract / terminate.

## Tái sử dụng hạ tầng

| Thành phần | Chiến lược |
|-----------|-----------|
| Scorecard recruitment (`ratings Json`, recommendation, notes) | **Mượn pattern** (model riêng `ProbationReview`, không dùng chung bảng) |
| Domain backend `leave` (routes→controller→service→repository + Zod) | **Mirror cấu trúc** cho `apps/api/src/domain/probation/` |
| `contract.service.create()` (quy tắc 1-ACTIVE, transactional) | **Tái dùng** (thêm optional tx client) cho CONFIRM |
| `employee.service.terminate()` | **Tái dùng** (thêm `reason` + optional tx client) cho FAIL |
| Reminder `probation_ending` (SPEC-017) | **Dùng nguyên**; chỉ thêm deep-link tới `/probation` |
| RBAC catalog + seed | **Mở rộng**: thêm `probation:*` vào catalog + system roles |
| Feature web `leave` (TanStack Query, DataTable, Sheet, AlertDialog) | **Mirror** cho `apps/web/src/features/probation/` |

## Permissions

Thêm vào `PERMISSION_CATALOG` (`packages/shared/src/types/rbac.ts`):
```
probation: ['view', 'review', 'decide', 'configure']
```
Cập nhật system roles (`apps/api/src/domain/rbac/catalog.ts`) + seed:
- **SUPER_ADMIN:** `*` (đã bao) · **HR_MANAGER:** view, review, decide, configure
- **MANAGER:** view, review (scope nhân viên dưới quyền, enforce ở service)
- **EMPLOYEE / PAYROLL_APPROVER:** không có.

## Out of scope (iteration sau)

- **Self-view của EMPLOYEE** (đã chốt loại khỏi iteration này)
- Dùng engine `ApprovalFlow`/`ApprovalStep` cấu hình nhiều cấp (probation cố định 2 bên: manager → HR)
- Trọng số (weight) cho tiêu chí + tổng điểm có trọng số (hiện chỉ điểm thô per-criteria)
- Nhiều người đánh giá / nhiều scorecard cho 1 review (hiện 1 manager/review)
- Đính kèm file vào review; ký số; xuất PDF biên bản đánh giá
- Email riêng cho review (chỉ tái dùng/deep-link reminder sẵn có)
- Tự động sinh review hàng loạt khi tới hạn (HR/manager tạo thủ công)

## Non-functional

- Tenant-scoped tuyệt đối; **RBAC server-side** (đặc biệt scope MANAGER → nhân viên dưới quyền)
- Mọi đổi trạng thái + hệ quả trong **một transaction** (atomic)
- TDD cho: validate submit (đủ điểm + recommendation), scope MANAGER, decide-side-effects (CONFIRM/EXTEND/FAIL), bất biến 1-review-open
- Integration test RBAC theo role; E2E critical path: manager đánh giá → nộp → HR confirm → nhân viên có hợp đồng FULL_TIME (assert kết quả nghiệp vụ, seed đủ state)
- WCAG AA, dark mode, i18n vi+en, design token (no hex), responsive 768–1440

## Boundaries

### Always Do
- Enforce scope MANAGER (chỉ nhân viên dưới quyền) ở **server**, không chỉ ẩn UI
- Chạy hệ quả CONFIRM/EXTEND/FAIL trong **một** transaction; refactor service để nhận tx (không lồng transaction)
- Ghi đủ audit: reviewer, recommendation, decidedBy, decision, decidedAt
- Giữ tối đa 1 review đang mở / nhân viên
- FAIL phải set `terminationReason` (= decisionNote)

### Never Do
- Không cho EMPLOYEE truy cập review (kể cả của chính mình)
- Không cho MANAGER `decide` (chỉ HR/SUPER_ADMIN)
- **HR không chỉnh sửa scorecard đã nộp** (đã chốt) — scorecard bất biến sau submit; HR chỉ đọc + quyết định
- **Không xóa cứng tiêu chí đã được review tham chiếu** (đã chốt) — chỉ cho deactivate
- Không nhân bản logic terminate / 1-ACTIVE-contract (phải tái dùng service)
- Không hardcode tiêu chí trong code (phải qua `ProbationCriteria` cấu hình)
- Không đổi nghĩa field cũ của Employee/Contract
