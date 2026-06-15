# SPEC-033 — Probation Self Evaluation (Bước 1 trong flow 3 bước)

> Status: **Draft (chờ xác nhận)** · Created: 2026-06-11 · Module: Probation (mở rộng SPEC-030/031/032)

## Objective

Đưa bước **Self Evaluation** vào flow đánh giá thử việc theo đúng quy trình công ty:
**Step 1: Self Evaluation (nhân viên)** → **Step 2: Manager** → **Step 3: Final Results (HR)**.
Nhân viên thử việc tự chấm 1–5 trên cùng bộ tiêu chí; manager đối chiếu khi chấm; HR thấy
cả hai khi ra quyết định.

## Quyết định phạm vi (đã chốt với user, dựa trên nghiên cứu 2024–2026)

| # | Quyết định | Lựa chọn |
|---|-----------|----------|
| 1 | Nội dung self-eval | **Tự chấm 1–5 cùng bộ tiêu chí** (kiểu Google GRAD) + 1 ô nhận xét tổng tùy chọn |
| 2 | Chặn flow | **Chặn mềm** — manager vẫn nộp được khi NV chưa tự đánh giá; hệ thống ghi rõ "NV chưa tự đánh giá" (theo cách Lattice/Leapsome/15Five) |
| 3 | Hiển thị | Manager **thấy điểm self ngay khi NV nộp** |
| 4 | Khởi tạo | **Manager tạo review như hiện tại** → NV nhận notification đi điền |

> ⚠️ **Lưu ý thiên kiến neo (anchoring bias):** nghiên cứu Harvard Kennedy School cho thấy
> manager dễ bị neo theo điểm tự chấm khi thấy trước. Tổ hợp đã chọn (tự chấm + thấy ngay)
> chấp nhận rủi ro này để ưu tiên minh bạch & trao đổi. Mitigation (toggle "ẩn điểm self
> tới khi manager nộp") để ngoài scope, có thể thêm sau khi productize.

## Target Users

| Role | Nhu cầu mới |
|------|-------------|
| **EMPLOYEE (đang thử việc)** | Nhận thông báo → mở trang "Tự đánh giá thử việc" → chấm 1–5 từng tiêu chí (có popover rubric hướng dẫn) + nhận xét → lưu nháp / nộp |
| **MANAGER** | Thấy step hiện tại của review (1/2/3); thấy điểm self cạnh điểm mình chấm để đối chiếu; thấy banner khi NV chưa tự đánh giá nhưng **không bị chặn** |
| **HR_MANAGER** | Khi quyết định thấy đủ: self scores + manager scores + chênh lệch |

## Flow trạng thái (KHÔNG thêm status mới)

Self evaluation là **artifact song song trên review khi DRAFT** — không đổi state machine
SPEC-030 (DRAFT → PENDING_HR → DECIDED / CANCELLED):

```
Tạo review (DRAFT)
  ├─ NV: điền self-eval (lưu nháp nhiều lần) → NỘP self (selfSubmittedAt set, khóa self)
  └─ Manager: chấm scorecard song song; nộp lúc nào cũng được (chặn mềm)
Manager nộp → PENDING_HR  (self-eval khóa vĩnh viễn dù chưa nộp — cơ hội đã qua)
HR quyết định → DECIDED
```

- Self-eval **chỉ sửa được khi**: review.status = DRAFT **và** chưa nộp self.
- Step indicator trên UI: 1 Self (done khi selfSubmittedAt) → 2 Manager (done khi
  PENDING_HR) → 3 Final (done khi DECIDED).

## Core Features

### 1. RBAC — permission mới `probation:self`
**Acceptance Criteria:**
- [ ] Thêm `self` vào catalog probation; gán cho **mọi system role** (EMPLOYEE/MANAGER/
      HR_MANAGER/SUPER_ADMIN — ai cũng có thể là người thử việc); seed + i18n permission
- [ ] Mọi endpoint self-eval gate `requirePermission('probation:self')` + controller
      **chỉ cho thao tác trên review của chính mình** (userId → employee → review.employeeId)
- [ ] EMPLOYEE vẫn KHÔNG có `probation:view` — không thấy review người khác

### 2. BE — self-eval trên ProbationReview
**Acceptance Criteria:**
- [ ] `ProbationReview` thêm: `selfRatings Json?` ({criteriaId: 1..5}), `selfComment
      String?` (≤2000), `selfSubmittedAt DateTime?`
- [ ] `GET /probation/reviews/me` — NV lấy review mở (DRAFT|PENDING_HR) của mình, trả
      **SelfReviewDto giới hạn**: id, status, probationEndDate, danh sách tiêu chí active
      (kèm group + rubric để hiện popover), selfRatings/selfComment/selfSubmittedAt.
      **KHÔNG lộ** điểm manager, recommendation, deliverables, quyết định HR. 404 khi
      không có review mở
- [ ] `PATCH /probation/reviews/:id/self` — lưu nháp (ratings partial + comment); 409
      `PROBATION_SELF_NOT_EDITABLE` nếu đã nộp self hoặc review không còn DRAFT
- [ ] `POST /probation/reviews/:id/self/submit` — yêu cầu chấm đủ tiêu chí active
      (400 `PROBATION_SELF_INCOMPLETE`); set selfSubmittedAt; bất biến sau nộp
- [ ] Manager/HR DTO (`ProbationReviewDto`) trả thêm selfRatings/selfComment/
      selfSubmittedAt (thấy ngay khi NV nộp — và cả nháp? **Không**: chỉ trả khi đã nộp,
      nháp là riêng tư của NV)
- [ ] Validator Zod mirror ratingsInput hiện có

### 2b. Manager Review — picker chỉ hiện team mình + đang PROBATION (chốt 2026-06-11)
**Hiện trạng khảo sát:** BE đã scope đúng (manager chỉ list/get/create review cho direct
reports — 403 nếu ngoài team; service đã chặn employee không PROBATION). Nhưng **picker
"Tạo đánh giá" trên FE** đang gọi `useEmployees({ contractType: 'PROBATION' })` **không
lọc team** → manager nhìn thấy cả người thử việc ngoài team (chọn sẽ bị 403 — server an
toàn nhưng UX sai).

**Acceptance Criteria:**
- [ ] Picker tạo review: nếu user là manager (không có quyền xem toàn tenant như HR) thì
      gọi `useEmployees({ contractType: 'PROBATION', status: 'ACTIVE', managerId: <employee
      id của chính mình> })` — API employees **đã hỗ trợ sẵn `managerId`**, chỉ cần truyền
      (lấy employee id từ `auth/me` mở rộng ở mục Technical)
- [ ] HR/SUPER_ADMIN (đủ quyền tenant-wide) giữ nguyên: thấy mọi nhân viên PROBATION
- [ ] Danh sách review của manager: xác nhận lại bằng test hiện có (đã team-scoped từ
      SPEC-030 — chỉ thêm assert nếu thiếu)

### 3. Notification cho nhân viên
**Acceptance Criteria:**
- [ ] Khi manager tạo review → notification cho NV chủ thể: "Bạn có bản tự đánh giá thử
      việc cần hoàn thành" deep-link `/probation/me` (dùng hạ tầng notification sẵn có)
- [ ] Out of scope: cadence nhắc lại T-3/T-1 (để SPEC sau nếu cần)

### 4. FE — Trang self-service `/probation/me` (EMPLOYEE)
**Acceptance Criteria:**
- [ ] Route mới `/probation/me` guard `probation:self`; nav item "Tự đánh giá" **chỉ hiện
      khi user hiện tại có `contractType = PROBATION`** (đã chốt với user 2026-06-11) —
      nhân viên chính thức không thấy mục này
- [ ] Server-side tương ứng: `GET /probation/reviews/me` trả 404 cả khi employee của user
      không ở trạng thái thử việc (không chỉ khi thiếu review mở) — chặn cả trường hợp
      gọi API trực tiếp
- [ ] Trang hiện empty state "Bạn không có đánh giá thử việc nào đang mở" khi đang thử
      việc nhưng manager chưa tạo review (404)
- [ ] Form: chấm 1–5 từng tiêu chí (tái dùng pattern radiogroup + **popover rubric** của
      SPEC-031 — NV cũng được xem hướng dẫn mức điểm), nhóm What/How + sub-score như
      manager; ô nhận xét tổng (tùy chọn); Lưu nháp / Nộp (confirm trước nộp vì bất biến)
- [ ] Sau nộp: form read-only + step indicator hiện trạng thái các bước
- [ ] Sau khi review DECIDED: trang hiện kết quả cuối? — **Out of scope** (NV chỉ thấy
      step 3 done, kết quả do HR/manager trao đổi trực tiếp)

### 5. FE — Scorecard manager/HR đối chiếu self
**Acceptance Criteria:**
- [ ] Step indicator "1 Tự đánh giá → 2 Quản lý → 3 Quyết định" trên đầu Sheet, tô trạng
      thái từng bước
- [ ] Khi NV **đã nộp** self: mỗi hàng tiêu chí hiện điểm self dạng badge phụ (vd "NV: 4",
      `tabular-nums`, muted) cạnh radiogroup của manager; selfComment hiện trong khối
      riêng "Nhân viên tự nhận xét"; sub-score self theo nhóm hiện cạnh sub-score manager
- [ ] Khi NV **chưa nộp**: banner nhẹ "Nhân viên chưa tự đánh giá" (info, không chặn) —
      hiện cả với HR ở bước quyết định
- [ ] HR ở PENDING_HR thấy đối chiếu đầy đủ self vs manager

## Out of Scope

- Toggle ẩn điểm self tới khi manager nộp (mitigation thiên kiến neo — sau)
- Cadence reminder tự động cho NV (T-3/T-1/overdue)
- NV xem kết quả quyết định cuối trên trang self
- Tự động tạo review trước hạn thử việc
- Câu hỏi tự sự cấu hình được (4 câu reflection) — user đã chọn tự chấm điểm

## Technical Approach

- **Schema**: 3 cột mới trên `probation_reviews` (selfRatings Json?, selfComment Text?,
  selfSubmittedAt timestamp?) — migration ADD COLUMN nullable, tương thích ngược tuyệt đối
- **Shared types**: `ProbationSelfReviewDto`, `PatchProbationSelfInput`,
  `SubmitProbationSelfInput`; mở rộng `ProbationReviewDto` (selfRatings/selfComment/
  selfSubmittedAt — null khi chưa nộp)
- **Layer**: thêm methods vào `probation-review.service` (getMine/patchSelf/submitSelf)
  + controller + routes; KHÔNG service mới (cùng aggregate)
- **Resolve employee từ user**: pattern sẵn có trong controller (manager scope) — tái dùng
- **Hiển thị nav theo contractType**: `GET /auth/me` (userToDto) hiện CHƯA có thông tin
  employee → mở rộng trả thêm `employee: { id, contractType } | null` (khảo sát 2026-06-11:
  chưa có endpoint employee-self nào khác). FE đọc từ auth store để quyết định hiện nav
  "Tự đánh giá" (`contractType === 'PROBATION'`). Đây là phần mở rộng nhỏ, hữu ích chung
  cho các tính năng self-service sau
- **FE**: page mới `ProbationSelfPage` + hooks (`useMyProbationReview`,
  `usePatchSelf`, `useSubmitSelf`); tái dùng popover rubric + radiogroup; route + nav + i18n vi/en
- **Notification**: dùng service notification hiện có (cùng pattern reminder probation_ending)

## Testing Strategy

- **Integration**: ma trận RBAC self endpoints (NV thao tác review mình 200; review người
  khác 403/404; MANAGER thiếu probation:self? — có probation:self nhưng sai chủ thể → 403);
  chặn mềm (manager submit khi NV chưa nộp → 200, DTO selfSubmittedAt=null); bất biến
  (patch self sau khi nộp → 409; sau PENDING_HR → 409); submit self thiếu tiêu chí → 400;
  DTO của NV không lộ trường manager (assert undefined)
- **E2E critical path mở rộng**: NV login → /probation/me → chấm đủ + nộp → manager mở
  scorecard thấy badge điểm self → chấm + nộp → HR thấy đối chiếu → CONFIRM → step 3 done
- **Unit**: helper tính sub-score self nếu tách riêng

## Boundaries

### Always Do
- RBAC server-side mọi endpoint mới; ownership check trong controller
- NV tuyệt đối không thấy dữ liệu manager/HR qua self DTO (privacy là bất biến thiết kế)
- TDD; tương thích ngược review cũ (self* = null → UI hiện "chưa tự đánh giá")

### Ask First
- Thêm thư viện mới (không dự kiến)
- Đổi state machine SPEC-030 (thiết kế này tránh được)

### Never Do
- Chặn cứng manager theo self-eval (đã chốt chặn mềm)
- Commit
- Log selfComment/PII

## Nguồn nghiên cứu

- Culture Amp — science behind review templates; self-reflections vs self-ratings
- Lattice — review stages, visibility settings, anchor bias guidance
- Leapsome / 15Five — soft deadlines, proceed-without-self patterns
- Harvard Kennedy School — self-ratings anchoring bias evidence
- AIHR / Eddy / SHRM — 90-day review templates & interim evaluation forms
- Google GRAD — self-rating on shared impact scale (mô hình user chọn)
