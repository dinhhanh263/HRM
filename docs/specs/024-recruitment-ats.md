# SPEC-024: Tuyển dụng (Recruitment / ATS) — MVP

**Status:** Draft (chờ duyệt)
**Created:** 2026-06-06
**Author:** Claude + Hạnh
**Depends on:** SPEC-001 (Auth), SPEC-002 (Employee), SPEC-003 (Authorization/RBAC)

---

## Objective

Xây dựng module **Tuyển dụng (ATS)** cho hệ thống HRM: lưu hồ sơ ứng viên & CV,
**scan CV tự động** (trích xuất thông tin có cấu trúc), theo dõi ứng viên qua một
**pipeline tuyển dụng cấu hình được**, thiết lập **lịch phỏng vấn** và ghi lại
**kết quả phỏng vấn có cấu trúc** (scorecard). Thiết kế theo chuẩn ATS chuyên nghiệp
(Greenhouse/Lever/Ashby) nhưng tinh gọn cho SMB Việt Nam.

## Nguyên tắc kiến trúc cốt lõi (quyết định nền tảng)

> **Tách "Ứng viên" (Candidate) khỏi "Hồ sơ ứng tuyển" (Application).**
> - **Candidate** = một *con người* (duy nhất, tồn tại lâu dài, có CV, được chống trùng).
> - **Application** = *một lần ứng tuyển của một người vào một vị trí*. Mang stage,
>   trạng thái, phỏng vấn, scorecard.
> - Quan hệ: 1 Candidate → nhiều Application → mỗi Application thuộc đúng 1 Job.
>
> Đây là điểm mọi ATS nghiêm túc đều làm và là thứ **rất đau nếu retrofit sau**.
> Nó cho phép: chống trùng CV, "tái khám phá" ứng viên cũ, lịch sử ứng tuyển nhiều năm.

Hai trạng thái tách biệt trên Application:
1. **Stage** = vị trí trong phễu (tùy biến per-job, có thứ tự).
2. **Status** = disposition cố định (`ACTIVE | HIRED | REJECTED | WITHDRAWN | ON_HOLD`).
   Khi reject vẫn **giữ stage bị reject** + **lý do reject** → phục vụ phân tích phễu sau này.

## Quyết định discovery (đã chốt 2026-06-06)

1. **Phạm vi MVP = lõi ATS** (Tier 1). Offer, báo cáo/analytics, job board, email
   templates, career site, talent pool → **Tier 2/sau** (xem Out of scope).
2. **Scan CV = LLM sau lớp adapter.** MVP cắm **Claude Haiku** (~180đ/CV ở quy mô SMB);
   interface `ResumeParser` cho phép hoán Affinda/self-hosted sau mà không sửa nghiệp vụ.
   Quyết định vì rẻ hơn parser chuyên dụng ~100 lần ở quy mô 100–1.000 CV/tháng.
3. **Build sẵn `ApplicationStageHistory` ngay từ MVP** dù chưa làm màn báo cáo —
   dữ liệu velocity/conversion không thể dựng lại sau.
4. **Full-stack mới**: Prisma schema + REST API (Express) + React UI theo tech stack CLAUDE.md.
5. **Job = Requisition + Posting gộp một** cho MVP (1 entity `Job`), giữ cửa tách sau.
6. **PDPL (Luật 91/2025, hiệu lực 1/1/2026)**: gắn cờ đồng ý + hạn lưu trữ vào
   Candidate ngay từ đầu (yêu cầu pháp lý VN), không để sau.

## Target Users

| User | Vai trò tuyển dụng | Actions chính |
|------|--------------------|---------------|
| **Super Admin / HR Manager** | Recruiter / quản trị tuyển dụng | Tạo vị trí tuyển, cấu hình pipeline, quản mọi ứng viên, lên lịch PV, ra quyết định |
| **Manager / Trưởng phòng** | Hiring Manager | Xem ứng viên vị trí của mình, di chuyển stage, ra quyết định tuyển |
| **Employee** | Interviewer (khi được gán) | Xem CV ứng viên được phân công PV, nộp scorecard |

> Quyền truy cập gắn theo **Hiring Team của từng Job** (xem Feature 7), không chỉ theo
> role toàn cục: một interviewer chỉ thấy ứng viên của Job mình tham gia.

---

## Core Features

### 1. Quản lý vị trí tuyển dụng (Job)
**Acceptance Criteria:**
- [ ] CRUD Job: tiêu đề, mô tả, phòng ban (FK `Department`), vị trí (FK `Position`, optional),
      loại hình (`FULL_TIME|PART_TIME|CONTRACT|INTERN`), địa điểm, số lượng cần tuyển (headcount)
- [ ] `JobStatus`: `DRAFT | OPEN | ON_HOLD | CLOSED | CANCELLED`; chỉ Job `OPEN` nhận ứng tuyển mới
- [ ] Mỗi Job có **1 pipeline riêng** (clone từ template tenant khi tạo), sửa stage không ảnh hưởng Job khác
- [ ] Danh sách Job: search, filter (phòng ban, status), đếm số ứng viên đang active mỗi stage
- [ ] Đóng/mở lại Job; gate `recruitment:job:*`

### 2. Pipeline cấu hình được (template + per-job)
**Acceptance Criteria:**
- [ ] `PipelineTemplate` cấp tenant (vd "Chuẩn", "Có bài test kỹ thuật", "Sales") — admin tạo/sửa
- [ ] Mỗi `Stage`: `name`, `order`, `type` (`SOURCED|SCREEN|ASSESSMENT|INTERVIEW|OFFER|HIRED|REJECTED`)
      — `type` để analytics chuẩn hóa dù tên tùy biến
- [ ] Tạo Job → clone stages từ template đã chọn sang pipeline của Job
- [ ] Thêm/sửa/xóa/đổi thứ tự stage trong 1 Job (không cho xóa stage đang có application active)
- [ ] Stage `HIRED`/`REJECTED` là terminal mặc định, luôn tồn tại

### 3. Ứng viên & chống trùng (Candidate)
**Acceptance Criteria:**
- [ ] Tạo/sửa Candidate: họ tên, email, SĐT, địa điểm, nguồn (`source`), links (LinkedIn/GitHub…),
      ảnh, chức danh hiện tại, tổng năm KN; các field VN: ngày sinh, giới tính (lưu, coi là dữ liệu cá nhân)
- [ ] **Chống trùng**: match theo email (chính) → SĐT (chuẩn hóa `+84`/`0…`) → fuzzy tên.
      Nhập trùng email → merge vào candidate cũ (hoặc tạo CV version mới), không tạo người trùng
- [ ] `source` enum: `CAREER_SITE | JOB_BOARD | REFERRAL | SOURCED | AGENCY | EVENT | DIRECT`
- [ ] **PDPL**: `consentGivenAt`, `consentSource`, `retentionUntil` trên Candidate; UI thu thập đồng ý
- [ ] Trang chi tiết ứng viên: tab CV/Hồ sơ · Lịch sử ứng tuyển · Ghi chú · Phỏng vấn

### 4. Upload & Scan CV (LLM parser sau adapter) ⭐
**Acceptance Criteria:**
- [ ] Upload file CV (PDF/DOCX) gắn vào Candidate (`CandidateAttachment`, giữ file gốc + nhiều version)
- [ ] **Trích text**: PDF (`pdf-parse`) / DOCX (`mammoth`) — miễn phí; CV ảnh-scan → ngoài MVP (note rõ)
- [ ] **Parse bất đồng bộ qua BullMQ**: text → `ResumeParser` (impl `HaikuResumeParser`) → JSON có cấu trúc
- [ ] `parseStatus`: `PENDING | PROCESSING | DONE | FAILED`; lỗi parse không chặn lưu CV, cho parse lại
- [ ] Field trích xuất: họ tên, email, SĐT, địa điểm, links, **skills[]**, kinh nghiệm (cty/chức danh/thời gian),
      học vấn, chứng chỉ, tổng năm KN → lưu `parsedData Json` + denormalize key fields lên Candidate
- [ ] Khi parse xong → đề xuất điền vào Candidate (người dùng **xác nhận/sửa**, không ghi đè mù)
- [ ] **`ResumeParser` là interface** — đổi provider (Affinda/self-host) không sửa code nghiệp vụ
- [ ] Prompt parser xử lý tốt **CV tiếng Việt có dấu**

### 5. Hồ sơ ứng tuyển & di chuyển pipeline (Application)
**Acceptance Criteria:**
- [ ] Tạo Application từ (Candidate × Job); **chặn trùng**: 1 candidate chỉ 1 application **active**/job
- [ ] Bảng Kanban theo stage của Job + danh sách; kéo-thả / nút "Chuyển stage"
- [ ] **`ApplicationStageHistory`** ghi mọi lần chuyển: `{fromStageId, toStageId, changedById, changedAt, note}` ⭐
- [ ] Reject: set `status=REJECTED` + **giữ stage hiện tại** + `rejectionReason` (enum) + note
- [ ] Rút/Withdrawn, On-hold; Hired → đặt stage `HIRED` + status `HIRED`
- [ ] `rejectionReason`: `UNDERQUALIFIED|OVERQUALIFIED|FAILED_ASSESSMENT|CULTURE_FIT|COMP_MISMATCH|POSITION_FILLED|CANDIDATE_WITHDREW|NO_SHOW|OTHER`
- [ ] Gate `recruitment:application:move` / `recruitment:application:reject`

### 6. Lịch phỏng vấn (Interview)
**Acceptance Criteria:**
- [ ] Lên lịch PV cho 1 Application tại 1 stage: thời gian, thời lượng, hình thức (`ONSITE|VIDEO|PHONE`),
      địa điểm/link họp, danh sách người PV (Interviewer)
- [ ] `InterviewStatus`: `SCHEDULED | COMPLETED | CANCELLED | NO_SHOW`
- [ ] Gán Interviewer (FK `Employee`); interviewer thấy PV được phân công + CV ứng viên
- [ ] MVP: lên lịch **thủ công** (không tích hợp Google/Outlook calendar — Tier 2, chỉ chừa hook)
- [ ] Hiển thị lịch PV sắp tới của người đăng nhập; gate `recruitment:interview:schedule`

### 7. Kết quả phỏng vấn — Scorecard có cấu trúc
**Acceptance Criteria:**
- [ ] Mỗi Interview → mỗi Interviewer nộp **1 Scorecard**: `overall` (`STRONG_NO|NO|YES|STRONG_YES`)
      + điểm theo tiêu chí (`ratings Json`, vd kỹ năng/văn hóa/giao tiếp 1–4) + ghi chú
- [ ] Interviewer chỉ nộp/sửa scorecard **của mình** cho PV mình được gán; không xem được của người khác trước khi nộp (tránh thiên kiến)
- [ ] Tổng hợp scorecard hiển thị trên Application (điểm trung bình + khuyến nghị từng người)
- [ ] Gate `recruitment:scorecard:submit`

### 8. Hiring Team, ghi chú & RBAC
**Acceptance Criteria:**
- [ ] `JobHiringTeam`: gán thành viên vào Job với `teamRole` (`RECRUITER|HIRING_MANAGER|INTERVIEWER|COORDINATOR`)
- [ ] **Ghi chú/activity** trên Application (`ApplicationActivity`: type, body, authorId) — notes + sự kiện hệ thống (chuyển stage, lên lịch PV…)
- [ ] **RBAC end-to-end server-side** (`requirePermission`); UI ẩn nút chỉ là UX
- [ ] Quyền theo Hiring Team: interviewer chỉ truy cập Application của Job mình tham gia; HR/Admin xem toàn tenant
- [ ] Mọi entity **tenant-scoped** tuyệt đối

---

## Data Model (Prisma — bổ sung mới)

```prisma
// ===== Enums =====
enum JobStatus            { DRAFT OPEN ON_HOLD CLOSED CANCELLED }
enum JobEmploymentType    { FULL_TIME PART_TIME CONTRACT INTERN }
enum StageType            { SOURCED SCREEN ASSESSMENT INTERVIEW OFFER HIRED REJECTED }
enum CandidateSource      { CAREER_SITE JOB_BOARD REFERRAL SOURCED AGENCY EVENT DIRECT }
enum ApplicationStatus    { ACTIVE HIRED REJECTED WITHDRAWN ON_HOLD }
enum RejectionReason      { UNDERQUALIFIED OVERQUALIFIED FAILED_ASSESSMENT CULTURE_FIT COMP_MISMATCH POSITION_FILLED CANDIDATE_WITHDREW NO_SHOW OTHER }
enum AttachmentKind       { CV COVER_LETTER OTHER }
enum ParseStatus          { PENDING PROCESSING DONE FAILED }
enum InterviewMode        { ONSITE VIDEO PHONE }
enum InterviewStatus      { SCHEDULED COMPLETED CANCELLED NO_SHOW }
enum ScorecardOverall     { STRONG_NO NO YES STRONG_YES }
enum HiringTeamRole       { RECRUITER HIRING_MANAGER INTERVIEWER COORDINATOR }

// ===== Pipeline template (cấp tenant) =====
model PipelineTemplate {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  name      String
  isDefault Boolean  @default(false) @map("is_default")
  stages    PipelineTemplateStage[]
  // tenant relation, @@unique([tenantId, name]), @@map("pipeline_templates")
}
model PipelineTemplateStage {
  id         String    @id @default(cuid())
  templateId String    @map("template_id")
  name       String
  order      Int
  type       StageType
  // @@unique([templateId, order]), @@map("pipeline_template_stages")
}

// ===== Job (requisition + posting gộp cho MVP) =====
model Job {
  id             String            @id @default(cuid())
  tenantId       String            @map("tenant_id")
  departmentId   String?           @map("department_id")
  positionId     String?           @map("position_id")
  title          String
  description    String?
  employmentType JobEmploymentType @default(FULL_TIME) @map("employment_type")
  location       String?
  headcount      Int               @default(1)
  status         JobStatus         @default(DRAFT)
  createdById    String            @map("created_by_id")  // Employee
  openedAt       DateTime?         @map("opened_at")
  closedAt       DateTime?         @map("closed_at")
  stages         JobStage[]
  applications   Application[]
  hiringTeam     JobHiringTeam[]
  // tenant/department/position relations, indexes, @@map("jobs")
}

// Stage thuộc 1 Job (clone từ template khi tạo Job)
model JobStage {
  id     String    @id @default(cuid())
  jobId  String    @map("job_id")
  name   String
  order  Int
  type   StageType
  applications        Application[]
  fromHistory         ApplicationStageHistory[] @relation("FromStage")
  toHistory           ApplicationStageHistory[] @relation("ToStage")
  // @@unique([jobId, order]), @@map("job_stages")
}

model JobHiringTeam {
  id         String         @id @default(cuid())
  jobId      String         @map("job_id")
  employeeId String         @map("employee_id")
  teamRole   HiringTeamRole @map("team_role")
  // @@unique([jobId, employeeId]), @@map("job_hiring_team")
}

// ===== Candidate (con người, chống trùng, PDPL) =====
model Candidate {
  id            String           @id @default(cuid())
  tenantId      String           @map("tenant_id")
  fullName      String           @map("full_name")
  email         String?
  phone         String?          // chuẩn hóa E.164 để dedupe
  location      String?
  currentTitle  String?          @map("current_title")
  totalYearsExp Float?           @map("total_years_exp")
  source        CandidateSource  @default(DIRECT)
  links         Json?            // {linkedin, github, portfolio}
  avatar        String?
  dateOfBirth   DateTime?        @map("date_of_birth")
  gender        Gender?
  skills        String[]         // denormalize để filter nhanh
  rawCvText     String?          @map("raw_cv_text")  // full-text search
  // PDPL
  consentGivenAt DateTime?       @map("consent_given_at")
  consentSource  String?         @map("consent_source")
  retentionUntil DateTime?       @map("retention_until")
  attachments   CandidateAttachment[]
  applications  Application[]
  // @@unique([tenantId, email]) (nullable — dedupe enforce ở service), index phone, @@map("candidates")
}

model CandidateAttachment {
  id             String         @id @default(cuid())
  candidateId    String         @map("candidate_id")
  kind           AttachmentKind @default(CV)
  fileUrl        String         @map("file_url")
  fileName       String         @map("file_name")
  parseStatus    ParseStatus    @default(PENDING) @map("parse_status")
  parserProvider String?        @map("parser_provider") // "haiku" | "affinda" ...
  parsedData     Json?          @map("parsed_data")
  parsedAt       DateTime?      @map("parsed_at")
  // @@map("candidate_attachments")
}

// ===== Application (junction Candidate × Job) =====
model Application {
  id              String            @id @default(cuid())
  tenantId        String            @map("tenant_id")
  candidateId     String            @map("candidate_id")
  jobId           String            @map("job_id")
  currentStageId  String            @map("current_stage_id")
  status          ApplicationStatus @default(ACTIVE)
  source          CandidateSource   @default(DIRECT)
  rejectionReason RejectionReason?  @map("rejection_reason")
  appliedAt       DateTime          @default(now()) @map("applied_at")
  stageHistory    ApplicationStageHistory[]
  interviews      Interview[]
  activities      ApplicationActivity[]
  // 1 active application / (candidate, job) — enforce ở service (partial unique)
  // index [tenantId, jobId, currentStageId], @@map("applications")
}

// ⭐ Lịch sử chuyển stage — nền tảng cho analytics velocity/conversion (build NGAY)
model ApplicationStageHistory {
  id            String   @id @default(cuid())
  applicationId String   @map("application_id")
  fromStageId   String?  @map("from_stage_id")
  toStageId     String   @map("to_stage_id")
  changedById   String   @map("changed_by_id")
  note          String?
  changedAt     DateTime @default(now()) @map("changed_at")
  // @@index([applicationId]), @@map("application_stage_history")
}

// ===== Interview & Scorecard =====
model Interview {
  id            String          @id @default(cuid())
  tenantId      String          @map("tenant_id")
  applicationId String          @map("application_id")
  stageId       String?         @map("stage_id")
  scheduledAt   DateTime        @map("scheduled_at")
  durationMin   Int             @default(60) @map("duration_min")
  mode          InterviewMode   @default(ONSITE)
  location      String?
  meetingUrl    String?         @map("meeting_url")
  status        InterviewStatus @default(SCHEDULED)
  createdById   String          @map("created_by_id")
  interviewers  InterviewInterviewer[]
  scorecards    Scorecard[]
  // @@map("interviews")
}
model InterviewInterviewer {
  interviewId String @map("interview_id")
  employeeId  String @map("employee_id")
  // @@id([interviewId, employeeId]), @@map("interview_interviewers")
}
model Scorecard {
  id            String           @id @default(cuid())
  interviewId   String           @map("interview_id")
  interviewerId String           @map("interviewer_id") // Employee
  overall       ScorecardOverall
  ratings       Json?            // {criterion: 1..4}
  notes         String?
  submittedAt   DateTime?        @map("submitted_at")
  // @@unique([interviewId, interviewerId]), @@map("scorecards")
}

// ===== Notes / activity feed =====
model ApplicationActivity {
  id            String   @id @default(cuid())
  applicationId String   @map("application_id")
  authorId      String?  @map("author_id")  // null = hệ thống
  type          String   // "NOTE" | "STAGE_CHANGED" | "INTERVIEW_SCHEDULED" ...
  body          String?
  createdAt     DateTime @default(now()) @map("created_at")
  // @@index([applicationId]), @@map("application_activities")
}
```

> Bổ sung back-relations vào `Tenant`, `Department`, `Position`, `Employee` (creator/interviewer/hiring-team).

## API (dưới `/api/v1/recruitment`)

| Method | Path | Permission |
|--------|------|-----------|
| GET/POST | `/jobs` · `/jobs/:id` (GET/PATCH) | `recruitment:job:read` / `:create` / `:update` |
| POST | `/jobs/:id/close` · `/reopen` | `recruitment:job:update` |
| GET/PUT | `/jobs/:id/stages` (reorder) | `recruitment:job:update` |
| GET/POST/PATCH | `/jobs/:id/team` | `recruitment:job:update` |
| GET/POST | `/pipeline-templates` (+ `/:id`) | `recruitment:job:update` |
| GET/POST/PATCH | `/candidates` (+ `/:id`) | `recruitment:candidate:read|create|update` |
| POST | `/candidates/:id/attachments` (upload CV) | `recruitment:candidate:update` |
| POST | `/attachments/:id/parse` (parse lại) | `recruitment:candidate:update` |
| GET | `/candidates/search?q=&skills=&minExp=` | `recruitment:candidate:read` |
| GET/POST | `/applications` (+ `/:id`) | `recruitment:application:read|create` |
| POST | `/applications/:id/move` (đổi stage) | `recruitment:application:move` |
| POST | `/applications/:id/reject` · `/withdraw` · `/hire` | `recruitment:application:reject|move` |
| POST | `/applications/:id/notes` | `recruitment:application:read` |
| GET/POST | `/interviews` (+ `/:id` PATCH/cancel) | `recruitment:interview:schedule` |
| GET/POST | `/interviews/:id/scorecard` | `recruitment:scorecard:submit` |

- List endpoints: tenant-scoped + lọc theo Hiring Team với role không phải HR/Admin.
- Response/pagination theo `api-conventions.md`.

## CV Scan — kiến trúc adapter

```
Upload CV ──► lưu file (S3/R2 hoặc disk dev) + CandidateAttachment(PENDING)
          └─► enqueue BullMQ "recruitment.cv.parse"
Worker: extractText(pdf-parse|mammoth) ──► ResumeParser.parse(text) ──► JSON
        └─► CandidateAttachment.parsedData + status=DONE; đề xuất điền Candidate

interface ResumeParser { parse(text: string): Promise<ParsedResume>; }
class HaikuResumeParser implements ResumeParser { /* gọi Claude Haiku, prompt JSON, validate Zod */ }
// Tier 2: AffindaResumeParser, SelfHostedResumeParser — thay qua DI, 0 đổi nghiệp vụ
```

- ParsedResume validate bằng **Zod** trước khi lưu (chống output LLM méo).
- Prompt yêu cầu JSON nghiêm ngặt, xử lý tiếng Việt có dấu, để trống field không chắc.
- API key qua env (`ANTHROPIC_API_KEY`), không hardcode.

## Permissions (thêm mới — seed vào RBAC)

```
recruitment:job:read | recruitment:job:create | recruitment:job:update
recruitment:candidate:read | recruitment:candidate:create | recruitment:candidate:update
recruitment:application:read | recruitment:application:create | recruitment:application:move | recruitment:application:reject
recruitment:interview:schedule
recruitment:scorecard:submit
```

Gán mặc định: `SUPER_ADMIN` (all) · `HR_MANAGER` (all recruitment:*) ·
`MANAGER` (job:read, candidate:read, application:read|move, interview:schedule, scorecard:submit) ·
`EMPLOYEE` (scorecard:submit + candidate:read **chỉ qua Hiring Team membership**).

## Code Style & Testing

- Theo toàn bộ `.claude/rules/` (TS strict, kebab-case file, layered: route→controller→service→repo).
- **TDD**: unit cho dedupe ứng viên, chuyển stage + ghi history, ResumeParser mapping (mock LLM),
  ràng buộc 1-active-application/job, RBAC theo Hiring Team.
- **Integration**: upload→parse (mock parser) đến khi `DONE`; tạo application; move stage ghi history;
  nộp scorecard; reject giữ stage + reason.
- **E2E critical path** (theo memory *coverage-not-proof*): upload CV → scan ra field → tạo application →
  kéo qua các stage → lên lịch PV → nộp scorecard → hire; assert **business outcome** (history đúng,
  status đúng, scorecard tổng hợp đúng), seed đủ state để effect quan sát được.
- UI: skeleton/empty/error đầy đủ; status badge màu + chữ; dark mode; i18n vi+en; design token (no hex);
  Kanban kéo-thả; Sheet cho form sửa (không Dialog); ⌘K-friendly.

## Out of scope (Tier 2 / iteration sau)

- **Offer management** (thư mời, duyệt offer, probation theo Bộ luật LĐ 2019, e-sign DocuSign)
- **Báo cáo/analytics** (time-to-hire, conversion phễu, nguồn hiệu quả) — *dữ liệu đã được ghi sẵn qua `ApplicationStageHistory`*
- **Tích hợp job board VN** (TopCV/VietnamWorks auto-push & kéo CV)
- **Career site / trang ứng tuyển công khai**, form ứng tuyển ngoài
- **Tích hợp lịch** (Google/Outlook), candidate self-scheduling, auto-availability
- **Email templates & giao tiếp ứng viên** (gửi mail trong app, log hội thoại)
- **Talent pool / CRM / sourcing chủ động**, tagging nâng cao
- **OCR CV ảnh-scan**; **AI semantic match / candidate rediscovery / gợi ý JD**
- **Requisition approval workflow** (tách Requisition khỏi Posting)
- Child tables chuẩn hóa `candidate_experience/education` (MVP dùng `parsedData Json` + `skills[]`)

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; đổi trạng thái trong **transaction**.
- File CV lưu S3/R2 (prod) — dev dùng disk; validate mime/size; không trust client.
- PDPL: lưu cờ đồng ý + `retentionUntil`; **không log dữ liệu cá nhân ứng viên** (`monitoring.md`).
- Parse CV async (BullMQ) — không block request upload; idempotent, retry backoff.
- WCAG AA, dark mode, i18n vi+en, design token.

## Boundaries

### Always Do
- **Tách Candidate ↔ Application** ngay từ đầu (không gộp).
- Ghi **`ApplicationStageHistory`** mọi lần chuyển stage (kể cả reject/hire).
- Reject **giữ stage** + `rejectionReason` (không xóa vết để analytics sau).
- Enforce RBAC + Hiring-Team scope ở **server**, không chỉ ẩn UI.
- `ResumeParser` qua interface; validate output LLM bằng Zod.
- Gắn cờ đồng ý PDPL + `retentionUntil` khi tạo Candidate.
- Chống trùng ứng viên theo email→phone→fuzzy name.

### Ask First
- Thêm provider parser trả phí (Affinda) hoặc đổi model LLM.
- Đưa bất kỳ mục Tier 2 nào (offer/analytics/job board) vào sớm.
- Lưu trữ CV ở dịch vụ cloud cụ thể nào (S3 vs R2) cho prod.

### Never Do
- Không gộp Candidate vào Application; không bỏ `ApplicationStageHistory`.
- Không cho interviewer xem scorecard người khác trước khi nộp (tránh thiên kiến).
- Không hardcode API key/secret; không log PII ứng viên.
- Không cho >1 application **active** của cùng candidate trên cùng job.
- Không ghi đè dữ liệu Candidate bằng output parser mà không cho người dùng xác nhận.
```
