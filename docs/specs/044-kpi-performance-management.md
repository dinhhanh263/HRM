# SPEC-044: KPI / Performance Management Engine (Quản lý KPI đa phòng ban)

**Status:** Approved (discovery resolved 2026-06-25)
**Created:** 2026-06-25
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC — catalog + guards), SPEC-005 (Leave Approval Flow — routing engine tái dùng), SPEC-011/012 (Payroll — pattern `Run → Line` + period + snapshot bất biến), SPEC-030/033 (Probation — pattern self-assessment 2 chiều), SPEC-039 (CV Storage/GCS — hạ tầng file), SPEC-036 (Tenant Settings Center — nơi đặt builder cấu hình)

---

## Objective

Xây một **engine KPI cấu hình được** phục vụ **mọi phòng ban** (Công nghệ/Agile, Sales,
Marketing, Nhân sự…) trong một hệ thống HRM đa ngành, productize bán SaaS. Mỗi phòng ban
định nghĩa **framework KPI riêng** (trụ cột · chỉ số · trọng số · thang điểm) qua cùng một
bộ khái niệm; hệ thống tự **chấm điểm 0–100**, **weighted theo role**, ra **rating** và hỗ
trợ chu kỳ **nhập liệu → tự đánh giá → review → chốt**. Framework "Agile Team KPI" (file
`Agile_Team_KPI_Framework.xlsx`) là **một template được seed sẵn**, không phải toàn bộ module.

## Vấn đề cần giải

- Công ty đa ngành: phòng Công nghệ quản theo agile mindset (velocity, defect, CI/CD…),
  còn Marketing/Sales/HR đo theo chỉ số hoàn toàn khác (doanh số, MQL, time-to-hire…).
  Một bộ KPI cứng không phục vụ được tất cả.
- Hiện việc theo dõi KPI nằm rải rác ở file Excel thủ công: công thức quy đổi điểm làm tay,
  copy block cho từng người, không có dấu vết review, không gắn với dữ liệu nhân sự thật.
- Cần: định nghĩa KPI linh hoạt theo phòng ban + tự động chấm điểm minh bạch (có "evidence")
  + chu kỳ review chính thức có phê duyệt + dashboard cá nhân/team.

## Quyết định discovery (đã chốt 2026-06-25)

1. **Engine cấu hình đầy đủ** — Admin tự tạo framework / trụ cột (pillar) / KPI / công thức
   quy điểm / weight profile / rating band cho từng phòng ban qua UI. Framework **Agile được
   seed sẵn** làm template tham chiếu. (Không hardcode bộ KPI.)
2. **Hai cấp đo lường** — mỗi KPI khai `scope`: `INDIVIDUAL` (doanh số, learning hours…) hoặc
   `TEAM` (velocity, CI/CD — chấm 1 lần ở cấp squad, **chia sẻ** xuống mọi thành viên squad).
   Tránh anti-pattern ép cá nhân chịu điểm team.
3. **v1 chỉ KPI chấm điểm** — KHÔNG làm OKR/quota trong iteration này (phase sau).
4. **Nhập tay + survey nội bộ** — quản lý nhập số liệu thực tế hàng kỳ; Team Health đo bằng
   **survey ẩn danh** dựng trong hệ thống. KHÔNG tích hợp Jira/Azure/SonarQube ở v1.
5. **Thêm thực thể `Squad/Team`** — đơn vị nhỏ trong phòng ban (vd Squad Alpha/Beta thuộc
   phòng Công nghệ). Nhân viên gán vào squad; KPI `scope=TEAM` chấm theo squad. HRM hiện chỉ
   có Department → thêm bảng `Team` + UI quản lý nhẹ.
6. **Self-assessment 2 chiều** — nhân viên **tự chấm/ghi nhận xét trước**, quản lý **review lại
   + calibrate** (tái dùng pattern module Thử việc SPEC-033). Trạng thái scorecard phản ánh
   2 bước này.
7. **Tái dùng tối đa hạ tầng có sẵn**: routing engine `ApprovalFlow`/`ApprovalStep`
   (thêm `ApprovalFlowType.KPI_REVIEW`); pattern `PayrollRun` (period + status + snapshot
   bất biến) cho `KpiCycle`; RBAC catalog `@hrm/shared` auto-sync qua `seed-rbac.ts`;
   storage GCS cho file đính kèm review (nếu cần).

## Target Users

| User | Actions |
|------|---------|
| **Employee** | Xem scorecard + xu hướng của mình; **tự đánh giá** (self-assessment) khi tới kỳ; trả lời survey ẩn danh |
| **Manager / Scrum Master / Team Lead** | Nhập số liệu KPI cho team/cấp dưới; review & calibrate self-assessment; viết nhận xét/strengths/action plan; xem dashboard team |
| **HR Manager** | Cấu hình framework cho mọi phòng ban; tạo/chốt chu kỳ; xem & export toàn công ty; calibrate cuối; quản lý survey |
| **Super Admin / Founder** | Toàn quyền; cấp duyệt cuối trong review chain; xem aggregate toàn tenant |

## Scoring model (cốt lõi — phải explainable, không hộp đen)

Quy đổi `actualValue → score 0–100`, neo vào thang rating của tenant:

```
scoringMethod = THRESHOLD_LINEAR (mặc định), HIGHER_BETTER:
  actual ≥ target        → 90..100   (target = mốc 90; vượt target cộng dần tới 100)
  min ≤ actual < target  → 60..90    (tuyến tính giữa 2 mốc)
  actual = min           → 60        (đáy "Đạt yêu cầu")
  actual < min           → 0..60     (tuyến tính xuống 0)
LOWER_BETTER → đảo chiều so sánh (vd Defect Density target 0.3 / min 0.5).

scoringMethod khác:
  DIRECT  → actualValue đã là điểm 0..100, không quy đổi (chỉ số composite).
  BOOLEAN → đạt/không = 100/0.
  BANDED  → ánh xạ khoảng → điểm theo bảng cấu hình.
```

- Hai mốc neo (60 = "Đạt", 90 = "Tốt") lấy từ `KpiRatingBand` của framework → tenant chỉnh được.
- **Pillar score** = Σ(KPI score × `weightInPillar`). **Overall** = Σ(pillar score × pillar weight theo weight profile của role). **Rating** = tra `KpiRatingBand`.
- Mỗi điểm hiển thị kèm bằng chứng: `actual` vs `target/min` + công thức áp dụng.

## Core Features (MVP — vertical slices)

### F0. Foundation + seed Agile framework
- Prisma models (mục Data Models) + migration; shared types (`@hrm/shared`); RBAC keys
  thêm vào catalog + `seed-rbac.ts`.
- Seed sẵn framework **"Agile Software Team"** từ file Excel: 4 pillars (Delivery 35 / Quality
  25 / Process 25 / Team Health 15), 16 KPI (đủ direction/target/min/unit/scope/inputType),
  6 weight profiles (Dev/QA/SM/PO/BA/DevOps), 5 rating bands, 2 survey templates.
- **AC:** chạy seed idempotent → tenant có framework Agile đầy đủ; tổng pillar weight = 100%;
  16 KPI khớp định nghĩa trong sheet "KPI Definition".

### F1. KPI Framework Builder (cấu hình)
- UI tại `/settings/kpi` (perm `kpi:config`): CRUD framework, pillar (kéo-thả thứ tự + trọng số),
  KPI definition (đủ field), weight profile (override trọng số pillar theo role/position),
  rating band; gán framework ↔ department(s); quản lý `Team/Squad`.
- Validate: Σ pillar weight = 100%; Σ weightInPillar mỗi pillar = 100%; mỗi weight profile Σ = 100%.
- **AC:** HR tạo được framework "Sales Performance" mới hoàn toàn từ rỗng (pillars + KPI khác hẳn
  Agile) và gán cho phòng Sales; lưu/sửa không vỡ ràng buộc 100%.

### F2. Cycle + Data Entry + Scoring engine
- `KpiCycle` (period `YYYY-MM` / `YYYY-Qn`, status `DRAFT → DATA_ENTRY → SELF_ASSESSMENT →
  PENDING_REVIEW → FINALIZED → CLOSED`), tạo theo framework/department, snapshot config khi finalize.
- Lưới nhập liệu (ô vàng) member × KPI; KPI `scope=TEAM` nhập ở cấp squad → fan-out điểm.
  Điểm 0–100 tính **live** khi nhập (engine ở backend, client hiển thị lại).
- Compute scorecard: pillar scores + weighted total + rating.
- **AC:** nhập actual cho 1 member đủ 16 KPI Agile → weighted total & rating khớp công thức tay
  trên 1 ví dụ kiểm chứng; sửa actual → điểm cập nhật; KPI team nhập 1 lần áp cho cả squad.

### F3. Member Dashboard + Team aggregate
- Member dashboard (`/kpi/:cycleId/:employeeId` & `/kpi/me`): pillar scores, weighted total,
  rating, **biểu đồ xu hướng theo kỳ** (Recharts), ghi chú phát triển.
- Team aggregate (analog "Annual Summary"): leaderboard, trung bình theo pillar, highest performer.
- Adaptive theo role (EMPLOYEE → self-view; MANAGER → team trước).
- **AC:** employee xem được scorecard + xu hướng của mình; manager xem bảng team + sắp xếp theo điểm.

### F4. Self-assessment + Review + Approval chain
- Employee tự chấm/ghi nhận xét (khi cycle ở `SELF_ASSESSMENT`); manager review & calibrate
  (có thể chỉnh điểm với ghi chú), viết strengths / areas-to-improve / action plan / recognition.
- Review đi qua `ApprovalFlowType.KPI_REVIEW` (Manager → HR calibrate → finalize), tái dùng
  `approval-routing.helper.ts`. Finalize → đóng băng `configSnapshot`, status `FINALIZED`.
- **AC:** vòng đời self-assessment → manager review → finalize chạy đủ; sau finalize scorecard
  bất biến; auto-skip bước trùng/không có người duyệt như Payment/Leave.

### F5. Survey Team Health (ẩn danh)
- Template `MONTHLY_MORALE` (3 câu, 1–10) + `QUARTERLY_PEER_360` (5 câu, 1–5); lịch gửi; nhân
  viên trả lời ẩn danh; aggregate → `KpiEntry` cho KPI T1/T2.
- **Ẩn danh cứng**: không lưu `raterId`; chỉ hiển thị kết quả khi ≥ N phản hồi (ngưỡng cấu hình).
- **AC:** tạo survey, thu phản hồi, kết quả aggregate ghi vào entry T1/T2; dưới ngưỡng N không lộ điểm.

### F6. Export + Insights
- Export Excel/PDF scorecard cá nhân & bảng team; insight "so với kỳ trước" cạnh mỗi metric.
- **AC:** export ra file đúng số liệu; insight delta hiển thị đúng dấu.

## Out of Scope (v1)

- Tích hợp tự động Jira / Azure DevOps / SonarQube / GitLab CI (kéo velocity, coverage, build).
- OKR / Key Results / quota định lượng song song KPI.
- Gắn KPI vào tính lương/thưởng (payroll) tự động.
- Calibration committee đa người / phân phối cưỡng bức (forced ranking).
- Mobile app riêng (chỉ responsive web 768–1440 + self-service ≤ 2 chạm).

## Technical Approach

### Data Models (Prisma — `cuid()`, `tenantId @map`, `@@map` snake_case, `onDelete: Cascade`)

**Cấu hình**
- `KpiFramework` — tenantId, name, description, defaultPeriodType, isActive.
- `KpiPillar` — frameworkId, name, weight (Decimal), order, color.
- `KpiDefinition` — pillarId, code, name, description, dataSource, unit, `direction`
  (`HIGHER_BETTER|LOWER_BETTER`), targetValue, minValue, weightInPillar, `scope`
  (`INDIVIDUAL|TEAM`), `inputType` (`MANUAL|SURVEY`), `scoringMethod`, frequency, isActive.
- `KpiWeightProfile` + `KpiProfilePillarWeight` — override trọng số pillar theo role/position.
- `KpiRatingBand` — frameworkId, minScore, maxScore, label, color, recommendedAction
  (kèm 2 mốc neo passAnchor=60, targetAnchor=90 cho engine).
- `KpiFrameworkAssignment` — frameworkId ↔ departmentId.
- `Team` (Squad) — tenantId, departmentId, name, leadId? ; `Employee.teamId?` (FK mới).

**Tracking (mirror PayrollRun → Payslip)**
- `KpiCycle` — tenantId, frameworkId, period, periodType, status, configSnapshot Json,
  createdById/submittedById/finalizedById + timestamps.
- `KpiScorecard` — cycleId, employeeId, weightProfileSnapshot, pillar scores (Json hoặc bảng con
  `KpiScorecardPillar`), weightedTotal, ratingBandLabel, self-assessment fields + reviewer fields
  (strengths, areasToImprove, actionPlan, recognition), reviewerId, status (self/review/final).
- `KpiEntry` — scorecardId (hoặc teamId cho scope=TEAM), kpiDefinitionId, actualValue,
  computedScore, source, enteredById, note.

**Survey**
- `KpiSurvey` (type, schedule, framework/dept scope, minResponses) + `KpiSurveyQuestion`
  (text, scale, mapsToKpiCode) + `KpiSurveyResponse` (KHÔNG lưu raterId; cycle/subject + answers).

**Enums:** `KpiDirection`, `KpiScope`, `KpiInputType`, `KpiScoringMethod`, `KpiPeriodType`,
`KpiCycleStatus`, `KpiScorecardStatus`, `KpiSurveyType`; thêm `ApprovalFlowType.KPI_REVIEW`.

### Scoring engine
- Pure module `domain/kpi/scoring.helper.ts` (testable): `scoreEntry(actual, def, band) → 0..100`,
  `computePillar`, `computeOverall`, `resolveRating`. Không side-effect (như `approval-routing.helper.ts`).

### Approval routing
- Tái dùng `buildApprovalSnapshot` / `findNextActiveStep` / `matchesApprover`; seed 1 flow
  `KPI_REVIEW` mặc định (Bước 1 = MANAGER, Bước 2 = ROLE hr_manager). Cấu hình được như Leave/OT.

### API (REST `/api/v1/kpi/...`, theo layered: routes → controller → service → repository)
- `kpi/frameworks` CRUD; `kpi/cycles` CRUD + transition; `kpi/cycles/:id/entries` (bulk upsert);
  `kpi/scorecards/:id` (self-assess / review / approve / reject); `kpi/surveys` + `respond`;
  `kpi/export`. Guard `requirePermission`/`requireAnyPermission`.

### Frontend (Vite SPA `apps/web/src/features/kpi/`)
- `pages/` (KpiPage, KpiConfigPage, KpiCyclePage, MemberDashboard, MyKpiPage, SurveyPage)
- `components/` (FrameworkBuilder, PillarEditor, KpiDefinitionForm, DataEntryGrid, Scorecard,
  KpiTrendChart, ReviewSheet, TeamAggregate, StatusBadge)
- `hooks/useKpi*.ts` (TanStack Query, optimistic cho nhập liệu)
- shared DTO trong `packages/shared/src/types/kpi.ts`.

### RBAC keys (thêm vào `PERMISSION_CATALOG`)
`kpi: ['view','view_team','view_all','config','enter','self_assess','review','approve','export','survey_manage']`
- EMPLOYEE: `view`, `self_assess` (+ trả lời survey, không cần perm riêng)
- MANAGER: `view`, `view_team`, `enter`, `review`, `self_assess`
- HR_MANAGER: tất cả trừ (đã gồm) — `view_all`, `config`, `approve`, `export`, `survey_manage`
- SUPER_ADMIN: all (bypass)

### i18n
- Namespace mới `kpi` → `apps/web/src/i18n/locales/{vi,en}/kpi.json`; đăng ký trong `i18n/index.ts`.
- Bổ sung `nav.json`: group + item sidebar + breadcrumb title + ⌘K actions. Đủ vi & en.

### Layout / Navigation
- Sidebar: thêm item **"KPI / Hiệu suất"** vào nhóm **Vận hành** (`groups.operations`), icon
  `Target` hoặc `Gauge`, route `/kpi`, perm `kpi:view`. Builder ở nhóm **Hệ thống** → `/settings/kpi`
  (perm `kpi:config`). Item `/kpi/me` self-service.

## Code Style
- Follow `.claude/rules/` + `CLAUDE.md` Design System + `ui-modern.md`.
- Backend: layered (routes/controller/service/repository), Zod validators, `AppError`, Pino.
- Frontend: shadcn/ui + token màu (no hex), TanStack Query, RHF+Zod, Sheet cho edit form,
  skeleton loading, empty state có CTA, `tabular-nums` cho số, a11y WCAG 2.2 AA.
- Tách scoring & routing thành pure helpers để test độc lập.

## Testing Strategy
- **Unit:** scoring engine (mọi `scoringMethod` + `direction` + biên min/target/vượt target);
  weight validation (=100%); aggregate tháng→quý (trung bình điểm tháng).
- **Integration (Supertest):** framework CRUD; cycle transition; bulk entry upsert + recompute;
  self-assessment → review → finalize (approval chain auto-skip); survey ẩn danh + ngưỡng N;
  RBAC (employee không xem được người khác; manager chỉ team mình).
- **E2E (Playwright, critical path):** HR tạo framework Sales mới → gán phòng Sales; manager nhập
  liệu 1 cycle → scorecard ra rating đúng; employee self-assess; finalize; export.
  *(Seed đủ state để hệ quả nghiệp vụ quan sát được — không quote coverage %.)*

## Boundaries

### Always Do
- `requirePermission` ở **mọi** route KPI (server-side là nguồn chân lý; ẩn UI chỉ là UX).
- Mọi model có `tenantId` + scope theo tenant ở mọi query.
- Đóng băng `configSnapshot` khi finalize → scorecard lịch sử bất biến.
- Survey: không bao giờ lưu danh tính người chấm; tôn trọng ngưỡng N.
- Validate tổng trọng số = 100% trước khi lưu cấu hình.
- i18n đủ vi + en; không hardcode text.

### Ask First
- Quy tắc aggregate tháng → quý (đề xuất: trung bình **điểm** tháng, không phải giá trị thô) — chốt ở F4.
- Có cho phép KPI `scope=TEAM` mà KHÔNG có Team (rơi về Department) như fallback hay bắt buộc gán Team.
- Thang neo điểm mặc định (60/90) có khác giữa các framework không.

### Never Do
- Không tích hợp công cụ ngoài (Jira/CI) ở v1.
- Không gắn KPI vào payroll/thưởng tự động ở v1.
- Không lộ điểm survey cá nhân (chỉ aggregate).
- Không hardcode bộ KPI Agile vào logic — nó là dữ liệu seed.

## Next Step
Sau khi spec được duyệt → chạy `/plan` để phân rã thành task theo 6 slice (F0→F6), ưu tiên
F0–F2 (foundation + builder + scoring) là lõi giá trị.
