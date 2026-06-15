# TODO-024: Tuyển dụng (Recruitment / ATS) — MVP

> Plan: `tasks/024-recruitment-ats-plan.md` · Spec: `docs/specs/024-recruitment-ats.md`
> Quy trình mỗi task: TDD (RED → GREEN → REFACTOR), test trước khi báo xong.

## Phase 1 — Foundation
- [x] 1.1 Prisma schema + migration (13 model + 12 enum, back-relations) — migration `20260606032134_recruitment_ats`, typecheck pass
- [x] 1.2 RBAC: 12 permission `recruitment:*` vào catalog (@hrm/shared) + role defaults + seed + i18n labels (vi/en) — 14 unit test pass, DB verified
- [x] 1.3 Scaffold BE route `/recruitment/ping` + FE trang/nav/i18n (vi+en), gated RBAC — 3 integration test pass; verified: HR thấy menu + trang render (ping 200), EMPLOYEE menu ẩn + route trả 403

### ✅ Checkpoint A — Foundation: migration applied · perms seeded · trang render gated · typecheck pass — DONE

## Phase 2 — Jobs & Pipeline
- [x] 2.1 Pipeline templates CRUD (DB+API+UI) + seed default template — 9 integration test pass; verified UI: HR thấy 2 template seed (badge mặc định), form tạo mở đúng với default stages, RBAC gated
- [x] 2.2 Job CRUD + status + clone pipeline khi tạo (transaction) + list search/filter — 11 integration test pass; UI verified: tạo job clone 6 stage từ pipeline mặc định, edit ẩn pipeline/status, chuyển DRAFT→OPEN qua menu (chỉ hiện transition hợp lệ), search + filter trạng thái/phòng ban, /recruitment = jobs list + /recruitment/pipelines tách riêng, RBAC gated (job_view route, job_create/update actions)
- [x] 2.3 Job detail: stage editor (reorder, chặn xóa stage có app active) + Hiring Team — typecheck pass; UI verified end-to-end: reorder+rename+save persisted, hiring team add/role-change/remove persisted (empty state OK), RBAC gated job_view/job_update

### ✅ Checkpoint B — Jobs: clone pipeline · sửa stage an toàn · hiring team · test pass — DONE

## Phase 3 — Candidates & CV Scan (risk-first)
- [ ] 3.1 Candidate CRUD + dedupe (email→phone E.164→fuzzy name) + PDPL consent/retention
- [ ] 3.2 Upload CV (PDF/DOCX) + lưu file + trích rawCvText + nhiều version
- [ ] 3.3 ⭐ CV scan adapter `ResumeParser`/`HaikuResumeParser` + BullMQ worker + "đề xuất điền" (xác nhận)
- [ ] 3.4 Search CV database (full-text + skills/minExp, bỏ dấu, debounce)

### ✅ Checkpoint C — Candidates+Scan: dedupe · parse(mock) DONE · 1 CV thật ra field · search bỏ dấu · test pass

## Phase 4 — Applications & Pipeline movement
- [x] 4.1 Tạo Application (Candidate × Job), chặn >1 active/(candidate,job), set stage đầu + source — unit 7/7 + integration 6/6; FE "Thêm vào vị trí" gated `recruitment:application_create`; browser verify POST → 201, tab "Ứng tuyển" hiển thị application stage "Ứng viên mới"
- [x] 4.2 ⭐ Pipeline board (cột theo JobStage, đếm số/stage) + move stage qua dropdown "Chuyển bước" + ghi `ApplicationStageHistory{from,to,by,at}` mọi lần + STAGE_CHANGED activity; optimistic update + rollback — integration 11/11 (history đúng thứ tự null→s0→s1→s2, 409 no-op/non-active, 422 foreign stage, 403 no-access); FE gated `recruitment:application_move`; browser verify PATCH → 200, board counts cập nhật, DB StageHistory 2 dòng + activity. (No drag-drop lib; disposition để 4.3; giữ status ACTIVE)
- [x] 4.3 Reject (status REJECTED + giữ stage + rejectionReason) / Hire (chuyển stage HIRED + status HIRED) / Withdraw (WITHDRAWN + giữ stage); ghi ApplicationStageHistory (hire) + activity REJECTED/HIRED/WITHDRAWN — api 51/51 (service 21 + rbac 14 + integration 16: reject giữ stage(0)+reason+activity, hire history 2 dòng + HIRED stage, withdraw giữ stage, 409 APPLICATION_NOT_ACTIVE khi dispose lại, 403 no-access cho cả 3); FE gated `recruitment:application_reject|hire|withdraw`; RejectApplicationDialog (Select 9 lý do + note) + AlertDialog hire/withdraw, optimistic remove khỏi board ACTIVE; browser verify: dropdown 3 action render, reject dialog chọn lý do → confirm → thẻ rời board, hire AlertDialog confirm → thẻ rời board
- [x] 4.4 Ghi chú ứng tuyển (ApplicationActivity NOTE) + activity feed — quyền riêng `recruitment:application_note` (hr_manager + manager), GET feed gated `application_view`; note cho phép trên mọi trạng thái (không chặn 409); api 21/21 integration (note 201 + author HR Manager, feed newest-first NOTE→APPLIED, note trên app đã withdraw, 422 body rỗng, 403 no-access) + rbac 14/14; FE Sheet phải mở từ tên ứng viên trên thẻ board → ApplicationActivityFeed timeline (6 loại sự kiện) + NoteComposer; browser verify: thêm note → hiện đầu feed newest-first, composer clear, không lỗi console + screenshot

### ✅ Checkpoint D — Pipeline: tạo app · history đúng · reject giữ stage+reason · notes · test pass ✅

## Phase 5 — Interviews & Scorecards
- [x] 5.1 Lịch PV (thời gian/mode/link) + gán interviewer (Employee) + "PV sắp tới của tôi" — Interview{scheduledAt,durationMin,mode ONSITE|VIDEO|PHONE,location|meetingUrl,status SCHEDULED→COMPLETED|CANCELLED|NO_SHOW} + InterviewParticipant(interviewer); INTERVIEW_SCHEDULED activity; api integration pass (create+assign, update status, my-upcoming chỉ SCHEDULED tương lai của user, 403 no-access); gate create/update `recruitment:interview_schedule`, my-upcoming gate `recruitment:scorecard_submit` để interviewer (kể cả EMPLOYEE) xem được; FE InterviewScheduler trong ApplicationDetailSheet (ScheduleForm datetime-local + duration + mode Select + location|meetingUrl + interviewer multi-select debounce 300ms; row + status badge + dropdown đổi trạng thái) + trang /recruitment/my-interviews + nav "PV của tôi"; browser verify: lên lịch → row "Đã lên lịch" + activity feed; đổi trạng thái → "Hoàn thành"; my-interviews populated card (lọc đúng COMPLETED ra) + empty state + screenshot; Google/Outlook calendar OUT OF SCOPE (MVP)
- [x] 5.2 Scorecard (overall + ratings + notes), no-peek + ownership, tổng hợp trên Application — api 17/17 (service no-peek + ownership 8; integration submit + aggregate 9); gate `recruitment:scorecard_submit`; FE ScorecardPanel trong InterviewRow (overall 4-button + criteria 1-4 toggle + notes; card hiển thị + TB điểm + tiến độ x/y; no-peek khi chưa nộp; viewer empty khi không phải interviewer); browser verify: gửi đánh giá → card + TB 3.0 + 1/1; interview thứ 2 (không phải interviewer) hiện viewer empty

### ✅ Checkpoint E — Interview: lên lịch+gán · scorecard no-peek+tổng hợp · test pass ✅

## Phase 6 — Detail, E2E & Polish
- [x] 6.1 Application detail page (CV·history·PV·scorecard·notes) + skeleton/empty/error, dark mode, a11y — `useApplication` hook (GET /recruitment/applications/:id); route `recruitment/applications/:id` gate `recruitment:application_view`; `ApplicationDetailPage.tsx` (back-to-job link · header avatar+name+StatusBadge+job link+source+appliedAt · grid 3-col: left Interviews(InterviewScheduler)+Activity(ApplicationActivityFeed+NoteComposer nếu canNote) · right stage pill + ScorecardSummary tổng hợp TB điểm/tiến độ/pill recommendation); `NoteComposer` tách dùng chung Sheet+Page; Sheet thêm link "Mở trang đầy đủ"; i18n vi+en `application.detail.*`; token no-hex, tabular-nums, focus-visible ring; typecheck web+api clean; browser verify light+dark (header, 2 PV+scorecard TB 3.0, activity+note, stage "Ứng viên mới", scorecard summary 12/6 1/1 3.0 + "Nên tuyển", 10/6 0/1 —), no console errors
- [x] 6.2 E2E critical path: upload→scan→application→move→PV→scorecard→hire (assert business outcome) — `e2e/recruitment-critical-path.spec.ts` full-UI Playwright (no API seeding): login → tạo job OPEN → tạo candidate → upload CV (HeuristicResumeParser ra "Đề xuất từ CV") → thêm vào vị trí → board → mở sheet (capture applicationHref) → lên lịch PV (interviewer = "Super Admin"/EMP-000 = user đăng nhập, bắt buộc để form scorecard render) → scorecard STRONG_YES → chuyển bước → hire (AlertDialog render role `dialog`); assert trên trang detail: status "Đã tuyển", TB điểm 4.0, activity feed đủ 4 sự kiện (APPLIED→STAGE_CHANGED→INTERVIEW_SCHEDULED→HIRED); xanh ổn định 2 lần (12.9s, 12.4s)
- [x] 6.3 Polish: ⌘K entries · i18n đầy đủ · design checklist CLAUDE.md — `CommandPalette.tsx` (Radix Dialog, KHÔNG thêm dep cmdk; ⌘K/Ctrl+K toggle toàn cục; 4 hành động tuyển dụng: Tạo tin tuyển dụng→`/recruitment?new=1`, Thêm ứng viên→`/recruitment/candidates?new=1`, Tìm ứng viên, PV của tôi + 12 mục điều hướng mirror Sidebar; lọc bỏ-dấu/hoa-thường qua `normalize` NFD+đ→d; ArrowUp/Down/Enter; mọi mục gate bằng `usePermission().can(permission)`); mount + nút trigger "Tìm kiếm nhanh ⌘K" trong AppLayout header; deep-link `?new=1` mở sheet tạo ở JobListPage+CandidateListPage (gate canCreate, strip param sau khi mở); bỏ hardcode tên 5 bước mặc định ở PipelineTemplateFormSheet → i18n `pipeline.defaultStages.*` (vi+en); i18n `nav:commandPalette.*` (vi+en); `CommandPalette.test.tsx` 5/5 xanh (open trên Ctrl+K, lọc "tuyen dung", gate quyền, navigate trên Enter, empty state); typecheck web clean; browser verify light+dark: ⌘K mở palette, lọc "tao tin"→1 kết quả, Enter→điều hướng `/recruitment?new=1`→sheet "Tạo tin tuyển dụng" mở + param strip; dark mode borderless-first đạt chuẩn

### ✅ Checkpoint F — Done: E2E xanh · design checklist pass · sẵn sàng `/review`
