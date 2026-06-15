# PLAN-024: Tuyển dụng (Recruitment / ATS) — MVP

**Spec:** `docs/specs/024-recruitment-ats.md`
**Created:** 2026-06-06
**Chiến lược:** Vertical slices (DB → API → UI mỗi slice). Foundation trước,
risk-first (CV parser), tôn trọng đồ thị phụ thuộc.

---

## Khảo sát codebase (Phase 1 — đã làm, read-only)

**Backend (DDD)** — `apps/api/src/`
- Route: `app/routes/v1/<feature>.routes.ts` (mount trong `app/routes/v1/index` + `app.ts`)
- Controller: `app/controllers/<feature>.controller.ts`
- Validator (Zod): `app/validators/`
- Service: `domain/services/<feature>.service.ts`
- Repository: `domain/repositories/<feature>.repository.ts`
- Helper/mapper theo feature: `domain/<feature>/` (vd `domain/leave/mappers.ts`)
- Queue BullMQ: mẫu `domain/employee-import/{*.queue.ts,*.worker.ts}` + `infrastructure/queue/connection.ts`
- RBAC: `domain/rbac/catalog.ts` — system roles + mảng permission key (`'assets:view'`…);
  `app/middlewares/authorize.middleware.ts` (`requirePermission`)
- Prisma: `apps/api/prisma/schema.prisma` (tenant-scoped, cuid, snake_case `@map`)

**Frontend** — `apps/web/src/`
- Feature: `features/<x>/{components,hooks,pages,index.ts,utils.ts}`
- Router: `router.tsx`; nav: sidebar; i18n: `i18n/` (vi+en); state: `stores/`
- Pattern: TanStack Query hooks, shadcn/ui, Sheet cho form, design token (no hex)

**Đối chiếu spec:** mọi entity mới tenant-scoped; tái dùng `Employee/Department/Position/User`;
CV parse theo mẫu BullMQ `employee-import`; thêm permission vào `catalog.ts`.

---

## Đồ thị phụ thuộc (rút gọn)

```
P1 Foundation (schema+RBAC+scaffold)
   └─► P2 Jobs & Pipeline ──┐
   └─► P3 Candidates & CV Scan ──┤
                                 └─► P4 Applications (cần Job + Candidate)
                                        └─► P5 Interviews & Scorecards
                                              └─► P6 Application detail + E2E + polish
```

---

## Phase 1 — Foundation

### Task 1.1 — Prisma schema + migration (toàn bộ model tuyển dụng)
**Objective:** Tạo nền dữ liệu đúng từ đầu (Candidate↔Application tách biệt, StageHistory).
**Files:**
- `apps/api/prisma/schema.prisma` (18 model + ~11 enum theo spec; back-relations vào `Tenant/Department/Position/Employee`)
- migration mới `prisma/migrations/*_recruitment_ats`
**Acceptance:**
- [ ] Tất cả model/enum theo "Data Model" của spec compile + `prisma migrate dev` chạy sạch
- [ ] `@@unique`/`@@index` theo spec; quan hệ Cascade hợp lý (xóa Job → Stage/Application cascade)
- [ ] Không phá dữ liệu hiện có; back-relations không vỡ build các model cũ
**Deps:** —
**Verify:** `prisma migrate dev` + `prisma generate` OK; `pnpm typecheck` (api) pass.

### Task 1.2 — RBAC: permission keys + role defaults + seed
**Objective:** Khai báo 11 permission `recruitment:*` và gán theo role.
**Files:**
- `apps/api/src/domain/rbac/catalog.ts` (thêm keys vào HR_MANAGER/MANAGER/EMPLOYEE theo spec)
- seed permission (cùng cơ chế sync permission hiện có)
**Acceptance:**
- [ ] 11 key theo spec tồn tại; gán đúng: HR_MANAGER all · MANAGER (read/move/interview/scorecard) · EMPLOYEE (scorecard:submit, candidate:read)
- [ ] `requirePermission('recruitment:job:read')` dùng được trong route
**Deps:** 1.1
**Verify:** unit test catalog có đủ key; seed chạy, role gán đúng.

### Task 1.3 — Scaffolding module (BE + FE) + i18n + nav
**Objective:** Khung rỗng end-to-end: 1 trang "Tuyển dụng" render được, gated RBAC.
**Files (BE):** `app/routes/v1/recruitment.routes.ts` (mount), `app/controllers/recruitment.controller.ts` (health/ping), `domain/recruitment/mappers.ts`
**Files (FE):** `features/recruitment/{index.ts,pages/RecruitmentPage.tsx}`, `router.tsx`, sidebar nav item, `i18n/{vi,en}/recruitment.json`
**Acceptance:**
- [ ] `GET /api/v1/recruitment/ping` trả 200, gated `recruitment:job:read`
- [ ] Route `/recruitment` hiện trong sidebar (ẩn nếu thiếu quyền), trang skeleton render, dark mode + i18n vi/en
**Deps:** 1.2
**Verify:** manual: đăng nhập HR thấy menu; EMPLOYEE không thấy job-admin; trang render.

> **Checkpoint A — Foundation:** migration applied · perms seeded · trang Tuyển dụng render gated · typecheck pass.

---

## Phase 2 — Jobs & Pipeline

### Task 2.1 — Pipeline templates (CRUD, cấp tenant)
**Objective:** Có template để Job clone stage khi tạo.
**Files (BE):** `domain/repositories/pipeline-template.repository.ts`, `domain/services/pipeline-template.service.ts`, controller + routes + validators; seed 1 template "Chuẩn" + "Có bài test".
**Files (FE):** `features/recruitment/components/PipelineTemplateSettings.tsx` + hook.
**Acceptance:**
- [ ] CRUD template + stages (name/order/type); gate `recruitment:job:update`
- [ ] Seed sẵn ≥1 default template/tenant; `isDefault` enforce ở service
**Deps:** 1.3
**Verify:** unit (service CRUD + reorder); manual UI.

### Task 2.2 — Job CRUD + status + clone pipeline khi tạo
**Objective:** Tạo/sửa/đóng vị trí tuyển; tạo Job sinh JobStage từ template.
**Files (BE):** `job.repository.ts`, `job.service.ts` (clone stages trong transaction), controller/routes/validators.
**Files (FE):** `pages/JobListPage.tsx`, `components/JobFormSheet.tsx`, hooks (`useJobs`,`useCreateJob`…).
**Acceptance:**
- [ ] CRUD Job; chọn template khi tạo → JobStage clone (transaction); `JobStatus` chuyển hợp lệ
- [ ] List: search + filter (dept/status), đếm application active/stage; chỉ `OPEN` nhận ứng tuyển
- [ ] Gate `recruitment:job:read|create|update`; tenant-scoped
**Deps:** 2.1
**Verify:** integration (tạo job → stages cloned); E2E nhỏ list/create.

### Task 2.3 — Job detail: stage editor + Hiring Team
**Objective:** Sửa pipeline của Job + gán team.
**Files (BE):** mở rộng `job.service` (PUT stages reorder, không xóa stage có app active), `JobHiringTeam` CRUD.
**Files (FE):** `pages/JobDetailPage.tsx`, `components/{StageEditor,HiringTeamPanel}.tsx`.
**Acceptance:**
- [ ] Thêm/sửa/xóa/đổi thứ tự stage; chặn xóa stage đang có application active; HIRED/REJECTED luôn tồn tại
- [ ] Gán/bỏ thành viên Hiring Team với `teamRole`
**Deps:** 2.2
**Verify:** unit (chặn xóa stage có app); manual UI.

> **Checkpoint B — Jobs:** tạo job clone pipeline · sửa stage an toàn · hiring team OK · test pass.

---

## Phase 3 — Candidates & CV Scan (risk-first)

### Task 3.1 — Candidate CRUD + dedupe + PDPL
**Objective:** Lưu ứng viên (con người), chống trùng, cờ đồng ý.
**Files (BE):** `candidate.repository.ts`, `candidate.service.ts` (dedupe email→phone chuẩn hóa→fuzzy name), controller/routes/validators; helper `domain/recruitment/phone-normalize.ts`.
**Files (FE):** `pages/CandidateListPage.tsx`, `components/CandidateFormSheet.tsx`, `pages/CandidateDetailPage.tsx` (tabs khung).
**Acceptance:**
- [ ] CRUD candidate; nhập trùng email → cảnh báo/merge, không tạo người trùng; phone chuẩn hóa E.164
- [ ] Field VN (DOB/gender) + PDPL (`consentGivenAt/consentSource/retentionUntil`); UI thu thập đồng ý
- [ ] Gate `recruitment:candidate:*`
**Deps:** 1.3
**Verify:** unit dedupe (email/phone/fuzzy) — nhiều case; integration tạo trùng.

### Task 3.2 — Upload CV + lưu file + trích text
**Objective:** Gắn file CV vào candidate, giữ bản gốc, trích text.
**Files (BE):** `candidate-attachment` repo/service; upload (multer/stream → S3/R2 prod, disk dev); `domain/recruitment/cv-text-extract.ts` (`pdf-parse`/`mammoth`).
**Files (FE):** `components/CvUploader.tsx`, list attachment + xem file.
**Acceptance:**
- [ ] Upload PDF/DOCX → `CandidateAttachment(PENDING)` + lưu `rawCvText`; validate mime/size; nhiều version
- [ ] CV ảnh-scan: báo "không trích được text" rõ ràng (ngoài MVP), không crash
**Deps:** 3.1
**Verify:** integration upload PDF mẫu → có rawCvText; reject file lạ.

### Task 3.3 — CV Scan adapter + BullMQ worker ⭐ (rủi ro cao nhất)
**Objective:** Parse text → JSON field; đề xuất điền candidate (xác nhận).
**Files (BE):** `domain/recruitment/resume-parser.ts` (interface), `haiku-resume-parser.ts` (Claude Haiku + Zod validate), `cv-parse.queue.ts` + `cv-parse.worker.ts` (mẫu employee-import); endpoint `POST /attachments/:id/parse`.
**Files (FE):** trạng thái parse (PENDING/PROCESSING/DONE/FAILED), panel "đề xuất điền" cho người dùng xác nhận/sửa.
**Acceptance:**
- [ ] Upload → enqueue → worker parse async → `parsedData` + `DONE`; lỗi → `FAILED`, parse lại được, không chặn lưu CV
- [ ] `ResumeParser` là interface; `parserProvider` lưu "haiku"; output validate Zod; xử lý CV tiếng Việt có dấu
- [ ] Parse xong **đề xuất** điền field — KHÔNG ghi đè mù; người dùng xác nhận
- [ ] `ANTHROPIC_API_KEY` qua env; không log PII
**Deps:** 3.2
**Verify:** unit parser mapping với **mock LLM** (fixture JSON); integration upload→parse(mock)→DONE; manual 1 CV thật.

### Task 3.4 — Tìm kiếm CV database (full-text + filter, bỏ dấu)
**Objective:** Tìm ứng viên theo text/skills/năm KN, không phân biệt dấu/hoa-thường.
**Files (BE):** `candidate.repository` search (Postgres FTS / `unaccent` + `ilike`; filter `skills[]`, `minExp`), enable extension nếu cần.
**Files (FE):** thanh search + filter trên CandidateList; debounce 300ms.
**Acceptance:**
- [x] Search rawCvText + tên + skills; "ky su" khớp "kỹ sư"; filter skills/minExp; pagination
**Deps:** 3.1 (3.3 để có skills)
**Verify:** integration search bỏ dấu; filter. ✅ 11/11 integration pass; UI verify "ky su"→"Kỹ sư", filter skills.

> **Checkpoint C — Candidates+Scan:** ✅ dedupe đúng · upload+parse(mock) DONE · 1 CV thật parse ra field · search bỏ dấu · test pass.

---

## Phase 4 — Applications & Pipeline movement

### Task 4.1 — Tạo Application (Candidate × Job)
**Objective:** Đưa ứng viên vào 1 vị trí; chặn trùng active.
**Files (BE):** `application.repository.ts`, `application.service.ts` (enforce 1-active/(candidate,job); set `currentStageId` = stage đầu), controller/routes/validators.
**Files (FE):** action "Thêm vào vị trí" từ candidate / "Thêm ứng viên" từ job; chọn source.
**Acceptance:**
- [x] Tạo application set stage đầu pipeline + `source`; chặn >1 active/(candidate,job)
- [x] Gate `recruitment:application_create`; tenant-scoped
**Deps:** 2.2, 3.1
**Verify:** unit chặn trùng active (7/7); integration tạo (6/6); browser verify: POST → 201, tab "Ứng tuyển" hiển thị application ở stage đầu "Ứng viên mới". ✅

### Task 4.2 — Kanban + chuyển stage + StageHistory + activity ⭐
**Objective:** Theo dõi & di chuyển ứng viên qua phễu, ghi lịch sử.
**Files (BE):** `application.service.move()` (transaction: đổi `currentStageId` + ghi `ApplicationStageHistory` + `ApplicationActivity` STAGE_CHANGED); endpoint `/move`.
**Files (FE):** `pages/JobPipelineBoard.tsx` (Kanban kéo-thả theo stage) + danh sách.
**Acceptance:**
- [x] Nút "Chuyển bước" (dropdown, không dùng drag-drop lib) → ghi `ApplicationStageHistory{from,to,by,at}` MỌI lần ⭐ + STAGE_CHANGED activity
- [x] Board nhóm theo JobStage, đếm số/stage; optimistic update + rollback lỗi
**Deps:** 4.1
**Verify:** ✅ integration 11/11 (history đúng thứ tự null→s0→s1→s2; 409 no-op/non-active; 422 foreign stage; 403 no-access); browser PATCH 200 + board counts cập nhật + DB StageHistory 2 dòng + activity + screenshot. (Drag-drop bỏ; disposition để 4.3; giữ status ACTIVE)

### Task 4.3 — Reject / Withdraw / Hire
**Objective:** Kết thúc hồ sơ đúng mô hình status, giữ vết.
**Files (BE):** `application.service` reject/withdraw/hire (giữ stage, set status + `rejectionReason`); endpoints.
**Files (FE):** dialog reject (chọn reason + note), nút hire/withdraw.
**Acceptance:**
- [x] Reject: `status=REJECTED` + **giữ stage** + `rejectionReason` + note (ghi activity)
- [x] Hire: stage `HIRED` + status `HIRED`; Withdraw: `WITHDRAWN`; ghi StageHistory/activity phù hợp
**Deps:** 4.2
**Verify:** ✅ api 51/51 (service 21 + rbac 14 + integration 16: reject giữ stage(0)+reason+REJECTED activity; hire history 2 dòng + HIRED stage + HIRED activity; withdraw giữ stage + WITHDRAWN; 409 APPLICATION_NOT_ACTIVE khi dispose lại; 403 no-access cho cả 3); FE gated `recruitment:application_reject|hire|withdraw`; web + api typecheck pass; browser verify: dropdown 3 action render, RejectApplicationDialog (9 lý do + note) → confirm → thẻ rời board ACTIVE, hire AlertDialog → confirm → thẻ rời board + screenshot. (Withdraw cùng AlertDialog với hire, phủ bởi integration test)

### Task 4.4 — Ghi chú ứng tuyển (notes)
**Objective:** Trao đổi nội bộ trên application.
**Files (BE):** `POST /applications/:id/notes` → `ApplicationActivity(NOTE)`.
**Files (FE):** activity feed (note + sự kiện hệ thống) trên Application detail.
**Acceptance:**
- [x] Thêm note (gate quyền riêng `recruitment:application_note` cho hr_manager + manager thay cho "Hiring-Team scope" vì scope team chưa tồn tại; note cho phép trên mọi trạng thái); GET feed gate `application_view`; feed hiển thị note + system events newest-first
**Deps:** 4.2
**Verify:** ✅ api 21/21 integration (note 201 + author='HR Manager'; feed newest-first [NOTE, APPLIED] với APPLIED author không null; note trên app đã withdraw 201; body rỗng → 422; no-access → 403) + rbac 14/14 + service unit 21/21; web + api typecheck pass; browser verify: thẻ board → click tên ứng viên mở Sheet feed (sự kiện APPLIED) → gửi note → note hiện đầu feed (NOTE 17:39 trên APPLIED 17:38), composer clear, 0 lỗi console + screenshot. (Deviation: dùng quyền riêng `application_note` thay vì `application:read`; bỏ Hiring-Team scope — chưa có cơ chế scope nào trong hệ thống)

> **Checkpoint D — Pipeline:** ✅ tạo app · kéo-thả ghi history · reject giữ stage+reason · notes · test pass.

---

## Phase 5 — Interviews & Scorecards

### Task 5.1 — Lịch phỏng vấn + gán interviewer
**Objective:** Lên lịch PV thủ công, phân công người PV.
**Files (BE):** `interview.repository.ts`, `interview.service.ts`, `InterviewInterviewer`; controller/routes/validators; ghi activity INTERVIEW_SCHEDULED.
**Files (FE):** `components/InterviewScheduler.tsx`, danh sách "PV sắp tới của tôi".
**Acceptance:**
- [x] Tạo PV (thời gian/thời lượng/mode/địa điểm-link) + gán interviewer (Employee); status `SCHEDULED→COMPLETED/CANCELLED/NO_SHOW`
- [x] Interviewer thấy PV được gán + CV ứng viên; gate `recruitment:interview_schedule` (my-upcoming gate `recruitment:scorecard_submit` để interviewer EMPLOYEE xem được)
- [x] Google/Outlook calendar hook OUT OF SCOPE (MVP)
**Deps:** 4.1
**Verify:** ✅ integration tạo PV + gán + update status + my-upcoming (chỉ SCHEDULED tương lai của user); manual: lên lịch → row "Đã lên lịch" + activity; đổi trạng thái → "Hoàn thành"; trang /recruitment/my-interviews populated (COMPLETED bị lọc ra) + empty state + screenshot. Cả 2 typecheck (web/api) sạch.
**Status:** ✅ DONE

### Task 5.2 — Scorecard (kết quả PV có cấu trúc)
**Objective:** Ghi đánh giá từng interviewer, tổng hợp, chống thiên kiến.
**Files (BE):** `scorecard` repo/service (`@@unique[interviewId,interviewerId]`; chỉ chủ scorecard sửa; ẩn của người khác trước khi nộp); endpoints.
**Files (FE):** `components/ScorecardForm.tsx` (overall + ratings tiêu chí + notes), tổng hợp trên Application.
**Acceptance:**
- [x] Mỗi interviewer 1 scorecard/PV: `overall` + `ratings Json` + notes; chỉ sửa của mình
- [x] Không xem scorecard người khác trước khi nộp (chống thiên kiến); tổng hợp (TB + khuyến nghị từng người) trên Application
- [x] Gate `recruitment:scorecard_submit` (submit) + `recruitment:application_view` (xem tổng hợp)
**Deps:** 5.1
**Verify:** unit no-peek + ownership (8 pass); integration submit + aggregate (9 pass); browser: gửi đánh giá → card + TB 3.0 + 1/1; viewer rỗng khi không phải interviewer.
**Status:** ✅ DONE

> **Checkpoint E — Interview:** lên lịch + gán · scorecard no-peek + tổng hợp · test pass. ✅

---

## Phase 6 — Application detail, E2E & Polish

### Task 6.1 — Application detail page (lắp ráp)
**Objective:** Một màn tổng hợp: CV/hồ sơ · lịch sử stage · PV · scorecard · notes.
**Files (FE):** `pages/ApplicationDetailPage.tsx` + ghép các component; skeleton/empty/error đầy đủ; dark mode; a11y (aria-label, focus, reduced-motion); status badge màu+chữ.
**Acceptance:**
- [x] Hiển thị đủ thông tin; loading skeleton, empty state có CTA, error toast; WCAG AA; i18n vi+en; token (no hex)
**Deps:** 4.x, 5.x
**Verify:** manual + screenshot light/dark (theo memory test-before-done).
**Status:** ✅ Done. `useApplication` hook (GET /recruitment/applications/:id) + route `recruitment/applications/:id` gate `recruitment:application_view`. `ApplicationDetailPage.tsx`: back-to-job link · header (avatar 48px + tên + StatusBadge + currentTitle + job link + nguồn + appliedAt) · loading skeleton / error block / notFound block · grid lg:3-col (trái col-span-2: Interviews=InterviewScheduler + Activity=ApplicationActivityFeed + NoteComposer khi canNote; phải: stage pill card + ScorecardSummary tổng hợp TB điểm/tiến độ/pill recommendation). `NoteComposer` tách dùng chung Sheet+Page; Sheet thêm link "Mở trang đầy đủ". i18n vi+en `application.detail.*`; token no-hex, tabular-nums, focus-visible ring. "Lịch sử stage" do activity feed (STAGE_CHANGED) phụ trách — không cần endpoint riêng. Typecheck web+api clean; browser verify light+dark (header, 2 PV+scorecard TB 3.0 "Nên tuyển", activity+note composer, stage "Ứng viên mới", scorecard summary 12/6 1/1 3.0 + pill, 10/6 0/1 —), 0 console error.

### Task 6.2 — E2E critical path (business outcome)
**Objective:** Bằng chứng đúng nghiệp vụ end-to-end.
**Files:** `apps/web` Playwright (hoặc theo bộ E2E hiện có) + seed đủ state.
**Acceptance:**
- [x] Luồng: upload CV → scan ra field → tạo application → kéo qua stages → lên lịch PV → nộp scorecard → hire
- [x] **Assert outcome** (theo memory coverage-not-proof): status=HIRED ("Đã tuyển") · scorecard tổng hợp 4.0 · activity feed đủ chuỗi APPLIED→STAGE_CHANGED→INTERVIEW_SCHEDULED→HIRED · không seed qua API (full-UI)
**Deps:** 6.1
**Verify:** E2E xanh; chạy lại ổn định (2 lần: 12.9s, 12.4s). File: `apps/web/e2e/recruitment-critical-path.spec.ts`.
**Notes:** interviewer phải là chính user đăng nhập ("Super Admin"/EMP-000) để form scorecard render (no-peek + ownership); AlertDialog hire render role `dialog`.

### Task 6.3 — Polish: ⌘K, design checklist, i18n đầy đủ
**Objective:** Hoàn thiện trải nghiệm theo CLAUDE.md + ui-modern.
**Files:** command palette entries (Thêm vị trí/Thêm ứng viên/Tìm ứng viên), rà i18n thiếu, design checklist.
**Acceptance:**
- [x] ⌘K có hành động tuyển dụng; 0 hardcoded text/hex; responsive 768–1440; checklist CLAUDE.md pass
**Deps:** 6.1
**Verify:** manual; rà checklist.
**Notes (Done):** `CommandPalette` (Radix Dialog, không thêm cmdk; ⌘K toàn cục; 4 hành động tuyển dụng + 12 mục điều hướng; lọc bỏ-dấu; gate quyền) mount trong AppLayout + nút trigger header. Deep-link `?new=1` mở sheet tạo (Job + Candidate, gate canCreate, strip param). Bỏ hardcode 5 stage mặc định ở PipelineTemplateFormSheet → i18n `pipeline.defaultStages.*`. i18n `nav:commandPalette.*` vi+en. Test 5/5 xanh; typecheck clean; browser verify light+dark OK (⌘K→lọc→Enter→sheet tạo mở, param strip). Lưu ý: 15 test FE fail tồn từ trước ở timesheet/assets (mock thiếu export `useResubmitOvertime`) — KHÔNG do 6.3, đã flag task riêng.

> **Checkpoint F — Done:** E2E xanh · design checklist pass · sẵn sàng `/review`.

---

## Rủi ro & giảm thiểu
- **CV parser (3.3)** là rủi ro lớn nhất → làm sớm trong phase candidate, test bằng **mock LLM** (không phụ thuộc mạng/chi phí trong CI), chỉ smoke 1 CV thật thủ công.
- **Output LLM méo** → Zod validate + fallback FAILED + parse lại.
- **PII/PDPL** → không log dữ liệu ứng viên; gắn consent/retention từ 3.1.
- **Schema sai (1.1)** → review kỹ Candidate↔Application + StageHistory trước khi sang phase khác (đắt nếu sửa sau).

## Out of scope (nhắc lại từ spec)
Offer · analytics dashboard · job board VN · career site · tích hợp lịch · email templates ·
talent pool · OCR · AI semantic match · requisition approval. (`ApplicationStageHistory` vẫn build ở 4.2.)
