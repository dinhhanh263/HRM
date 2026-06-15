# Plan: SPEC-025 — "PV của tôi" + nhập đánh giá

Spec: [docs/specs/025-my-interviews-scorecard-entry.md](../docs/specs/025-my-interviews-scorecard-entry.md)

## Quyết định đã chốt
- Thay hẳn `GET /recruitment/interviews/my-upcoming` → `GET /recruitment/interviews/mine` trả `{ upcoming, toReview }` (cập nhật FE).
- `toReview` gồm cả buổi đã chấm (đánh dấu `myScorecardSubmitted`, cho sửa).

## Integration points (đã khảo sát)
- Backend: [interview.repository.ts](../apps/api/src/domain/repositories/interview.repository.ts), [interview.service.ts](../apps/api/src/domain/services/interview.service.ts), [interview.controller.ts](../apps/api/src/app/controllers/interview.controller.ts), [recruitment.routes.ts:240](../apps/api/src/app/routes/v1/recruitment.routes.ts).
- Shared: [recruitment.ts:502](../packages/shared/src/types/recruitment.ts) (`MyUpcomingInterviewDto`).
- Frontend: [useInterviews.ts](../apps/web/src/features/recruitment/hooks/useInterviews.ts), [MyUpcomingInterviewsPage.tsx](../apps/web/src/features/recruitment/pages/MyUpcomingInterviewsPage.tsx), tái dùng [ScorecardPanel.tsx](../apps/web/src/features/recruitment/components/ScorecardPanel.tsx).
- Route guard FE giữ `recruitment:scorecard_submit`.

---

## Slice 1 — Interviewer thấy buổi PV đã diễn ra để đánh giá (DB→API→UI)

**Objective:** Buổi PV đã qua/COMPLETED của tôi xuất hiện ở mục "Chờ đánh giá"; buổi sắp tới vẫn ở "Sắp tới".

**Files:**
- `packages/shared/src/types/recruitment.ts` — thêm `myScorecardSubmitted: boolean` vào `MyUpcomingInterviewDto`; thêm `MyInterviewsDto { upcoming; toReview }`.
- `apps/api/src/domain/repositories/interview.repository.ts` — `listToReviewByInterviewer(employeeId, tenantId, now)` (include scorecards của tôi để suy `myScorecardSubmitted`); giữ `listUpcomingByInterviewer`.
- `apps/api/src/domain/services/interview.service.ts` — `listMine()` trả `{ upcoming, toReview }`, map `myScorecardSubmitted`, xếp chưa-chấm trước.
- `apps/api/src/app/controllers/interview.controller.ts` — `listMine`.
- `apps/api/src/app/routes/v1/recruitment.routes.ts` — đổi route `/interviews/my-upcoming` → `/interviews/mine`.
- `apps/web/src/features/recruitment/hooks/useInterviews.ts` — `useMyInterviews()` gọi `/interviews/mine`.
- `apps/web/src/features/recruitment/pages/MyUpcomingInterviewsPage.tsx` — render 2 mục + badge "đã/chờ đánh giá".
- i18n: `apps/web/src/locales/{vi,en}/recruitment.json` — key mục mới.

**Acceptance:**
- [ ] Buổi đã qua giờ, tôi là interviewer → ở `toReview`, `myScorecardSubmitted=false`, xếp trên.
- [ ] Buổi tôi đã chấm → vẫn ở `toReview`, `myScorecardSubmitted=true`.
- [ ] `CANCELLED`/`NO_SHOW` không xuất hiện; future `SCHEDULED` chỉ ở `upcoming`.
- [ ] Không phải interviewer → không thấy buổi đó.

**Verification:** unit (service grouping), integration (`GET /interviews/mine`), preview render 2 mục.

**Dependencies:** none.

---

## Checkpoint 1
- [ ] `pnpm --filter @hrm/shared build` + typecheck pass (DTO mới lan tỏa đúng).
- [ ] Endpoint trả đúng 2 nhóm; FE list hiển thị không lỗi console.

---

## Slice 2 — Nhập đánh giá ngay tại "PV của tôi" (UI→API)

**Objective:** Từ thẻ "Chờ đánh giá", interviewer mở `ScorecardPanel` inline, nộp/sửa scorecard; sau khi nộp `myScorecardSubmitted` lật `true`.

**Files:**
- `apps/web/src/features/recruitment/pages/MyUpcomingInterviewsPage.tsx` — nút "Nhập đánh giá"/"Sửa đánh giá" expand `ScorecardPanel` (truyền `interview` + `applicationId`).
- `apps/web/src/features/recruitment/hooks/useScorecards.ts` — đảm bảo invalidate `interviewKeys.mine()` sau submit (để thẻ cập nhật trạng thái).
- `apps/web/src/features/recruitment/hooks/useInterviews.ts` — thêm key `mine()`.

**Acceptance:**
- [ ] Mở thẻ → chọn verdict → Lưu (≤ 2 thao tác), không rời trang.
- [ ] Sau Lưu, thẻ chuyển "đã đánh giá"; no-peek giữ nguyên (chỉ thấy người khác sau khi tự nộp).

**Verification:** preview thao tác thật + screenshot; network 200.

**Dependencies:** Slice 1.

---

## Checkpoint 2 / Phase Test + Review
- [ ] Unit: service grouping (5 case acceptance Slice 1).
- [ ] Integration: gate 403 khi thiếu `scorecard_submit`; submit → buổi đổi `myScorecardSubmitted`.
- [ ] E2E critical-path: seed interview đã qua + interviewer X → login X → nhập scorecard từ "PV của tôi" → assert DB có scorecard cho interview đó.
- [ ] Preview verify UI (light/dark) + screenshot.
- [ ] /review five-axis.

## Next: `/build` Slice 1 trước (TDD: RED→GREEN→REFACTOR).
