# Feature: "PV của tôi" — interviewer tự phục vụ nhập đánh giá

> SPEC-025 · Bổ sung cho SPEC-024 (Recruitment ATS). Sửa lỗ hổng quy trình ở màn hình "My Interviews".

## Objective

Cho interviewer một điểm vào duy nhất để **tìm buổi phỏng vấn cần nhập đánh giá** (kể cả buổi đã diễn ra) và **nhập scorecard ngay tại đó**, thay vì phải tự lần mò Recruitment → Job → ứng viên → hồ sơ.

## Vấn đề (root cause đã xác minh)

Màn hình hiện tại `MyUpcomingInterviewsPage` chỉ truy vấn interview `status=SCHEDULED AND scheduledAt >= now`
([interview.repository.ts:53](../../apps/api/src/domain/repositories/interview.repository.ts)). Hệ quả:

1. **Sau khi buổi PV diễn ra** — đúng lúc cần nhập đánh giá — interview rớt khỏi bộ lọc "sắp tới" và **biến mất** khỏi màn hình duy nhất dành cho interviewer. Không có mục "đã qua / chờ đánh giá". Đây là lý do HR báo "check My Interviews không thấy lịch nào".
2. Ngay cả khi còn hiện, thẻ PV link tới trang ứng viên `/recruitment/candidates/:id`
   ([MyUpcomingInterviewsPage.tsx:41](../../apps/web/src/features/recruitment/pages/MyUpcomingInterviewsPage.tsx)),
   **không** dẫn tới ô nhập scorecard (nằm trong trang Application detail). Interviewer vẫn phải tự đi tìm.

> Đã loại trừ: thiếu quyền (DB cho thấy role có `scorecard_submit` + `application_view`), sai ánh xạ employee↔user, lỗi timezone, query repo lỗi. Backend trả dữ liệu đúng — đây là lỗ hổng **thiết kế surface**, không phải lỗi tầng dữ liệu.

## Target Users

Mọi nhân viên là interviewer (panellist) — gồm cả role `EMPLOYEE` chỉ có `recruitment:scorecard_submit`. Họ cần nhập đánh giá nhanh sau buổi PV mà không cần quyền duyệt nghiệp vụ.

## Core Features

1. **Backend: liệt kê "PV của tôi" theo 2 nhóm** — **thay** endpoint `GET /recruitment/interviews/my-upcoming` bằng `GET /recruitment/interviews/mine` (quyết định đã chốt) trả về:
   - `upcoming`: `status=SCHEDULED AND scheduledAt >= now` (chuẩn bị trước PV).
   - `toReview`: interview mà **tôi là interviewer** và buổi PV đã thực sự diễn ra: `status = COMPLETED` **HOẶC** (`status = SCHEDULED AND scheduledAt < now`). **Loại trừ** `CANCELLED` và `NO_SHOW`. Nhóm này **bao gồm cả** buổi tôi đã chấm (đánh dấu qua `myScorecardSubmitted`, cho phép sửa) — quyết định đã chốt; buổi chưa chấm xếp trước.
   - **Acceptance:**
     - Interviewer A được phân buổi PV đã qua giờ, chưa nộp scorecard → buổi đó nằm trong `toReview`, `myScorecardSubmitted=false`, xếp trên.
     - A đã nộp scorecard của mình → buổi vẫn ở `toReview` nhưng `myScorecardSubmitted=true`, cho sửa.
     - Buổi `CANCELLED`/`NO_SHOW` → không xuất hiện ở nhóm nào.
     - Buổi `SCHEDULED` còn ở tương lai → chỉ ở `upcoming`.
     - Người không phải interviewer của buổi đó → không thấy buổi đó.

2. **DTO mở rộng** — mỗi thẻ trả thêm `applicationId` (đã có sẵn qua `InterviewDto`) và `myScorecardSubmitted: boolean` để frontend biết hiển thị "Nhập đánh giá" hay "Sửa đánh giá".

3. **Frontend: trang "PV của tôi" 2 mục** — đổi `MyUpcomingInterviewsPage`:
   - Mục **Sắp tới** và mục **Chờ đánh giá** (mục Chờ đánh giá đứng trên, vì là việc cần làm).
   - Mỗi thẻ ở nhóm "Chờ đánh giá" có nút **"Nhập đánh giá"** → mở `ScorecardPanel` (tái dùng nguyên trạng, nhận `interview` + `applicationId`) ngay trong trang (inline expand).
   - Empty state riêng cho từng mục; vẫn giữ link tới ứng viên/PV để xem ngữ cảnh.
   - **Acceptance:** Từ "PV của tôi", interviewer nhập được scorecard cho buổi đã qua trong ≤ 2 thao tác (mở thẻ → chọn verdict → Lưu), không rời trang.

## Out of Scope

- Không đổi luật no-peek/bias trong scorecard (giữ nguyên `scorecardService`).
- Không tự động đổi `status` interview sang COMPLETED (giữ luồng cập nhật status hiện có).
- Không gửi nhắc nhở/notification "bạn có PV chờ đánh giá" (có thể là SPEC sau).
- Không đụng quyền RBAC: route giữ gate `recruitment:scorecard_submit` (đã đúng).

## Technical Approach

- **Repository** (`interview.repository.ts`): giữ `listUpcomingByInterviewer` (cho `upcoming`); thêm `listToReviewByInterviewer(employeeId, tenantId, now)` — `interviewers: { some: { employeeId } }`, loại `CANCELLED`/`NO_SHOW`, điều kiện (`status = COMPLETED` OR (`status = SCHEDULED` AND `scheduledAt < now`)). Include thêm `scorecards: { where: { interviewerId: employeeId }, select: { id: true } }` để suy ra `myScorecardSubmitted`. Sắp xếp `scheduledAt desc`.
- **Service** (`interview.service.ts`): đổi `listMyUpcoming` → `listMine(tenantId, userId)` resolve employee qua `findByUserId`; không có profile → `{ upcoming: [], toReview: [] }`. Map DTO, set `myScorecardSubmitted`; trong `toReview` xếp chưa-chấm trước, đã-chấm sau.
- **Route/Controller**: **thay** `GET /interviews/my-upcoming` bằng `GET /interviews/mine` trả `{ upcoming, toReview }`. Gate `requirePermission('recruitment:scorecard_submit')` (giữ nguyên).
- **Shared types**: thêm `MyInterviewsDto { upcoming: MyUpcomingInterviewDto[]; toReview: MyUpcomingInterviewDto[] }`; thêm `myScorecardSubmitted: boolean` vào `MyUpcomingInterviewDto`.
- **Frontend**: đổi hook `useMyUpcomingInterviews` → `useMyInterviews()` (gọi `/interviews/mine`); trang render 2 mục (Chờ/đã đánh giá ở trên, Sắp tới ở dưới); tái dùng `ScorecardPanel`. i18n key mới ở `recruitment` (vi + en).

## Code Style

- Tuân thủ `.claude/rules/` (kebab-case file, 2 spaces, single quotes, TanStack Query, không gọi fetch trực tiếp, token màu không hardcode, skeleton khi load).
- Không log PII; giữ no-peek nguyên vẹn.

## Testing Strategy

- **Unit** (`interview.service`/repo): nhóm hóa đúng (đã nộp → rời awaiting; CANCELLED/NO_SHOW loại; future SCHEDULED chỉ ở upcoming; không phải interviewer → rỗng).
- **Integration** (supertest): `GET /interviews/mine` cho interviewer thấy buổi đã qua chưa chấm; sau khi `PUT scorecard` thì buổi rời nhóm awaiting. Gate 403 khi thiếu `scorecard_submit`.
- **E2E (critical path)**: seed 1 interview đã qua giờ với interviewer X → login X → "PV của tôi" → "Chờ đánh giá" có ứng viên → nhập verdict → Lưu → khẳng định **outcome nghiệp vụ**: scorecard tồn tại trong DB cho interview đó và buổi rời khỏi "Chờ đánh giá". (Seed đủ state để hiệu ứng quan sát được — không chỉ coverage%.)
- Xác minh UI bằng preview + screenshot trước khi báo xong.

## Boundaries

### Always Do
- Giữ gate backend `requirePermission` + check "phải là interviewer" trong `scorecardService.submit`.
- Giữ no-peek.
- Test critical-path bằng outcome, không phải coverage%.

### Đã chốt
- Thay hẳn `my-upcoming` bằng `GET /interviews/mine` (cập nhật cả FE).
- Mục `toReview` hiển thị cả buổi đã chấm, đánh dấu "đã đánh giá" + cho sửa.

### Never Do
- Không nới quyền xem scorecard người khác.
- Không tự đổi status interview.
- Không commit (theo ràng buộc của user).

## Next Step
Sau khi SPEC được duyệt → `/plan`.
