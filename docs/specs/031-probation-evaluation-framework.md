# SPEC-031: Probation Evaluation Framework (Khung năng lực hướng dẫn đánh giá thử việc)

**Status:** Draft (chờ xác nhận)
**Created:** 2026-06-10
**Author:** Claude + Hạnh
**Depends on:** SPEC-030 (Probation Review) — mở rộng trực tiếp; SPEC-003 (RBAC); model `ProbationCriteria` + `ProbationReview` đã có

---

## Objective

Biến scorecard thử việc (SPEC-030) từ "chấm điểm trần 1–5 không định nghĩa" thành **đánh
giá có khung năng lực (BARS — Behaviorally-Anchored Rating Scale)**: mỗi mức điểm 1–5 của
mỗi tiêu chí có **định nghĩa + biểu hiện quan sát được**, hiển thị như **bản hướng dẫn
ngay tại chỗ chấm** để Manager chấm nhất quán, có căn cứ. Đồng thời cho phép Manager
**đính kèm danh sách công việc (deliverable) làm bằng chứng** cho đánh giá.

## Vấn đề với hiện trạng (sau SPEC-030)

- Scorecard hiện chỉ có **tên tiêu chí + nút 1..5**, không nói rõ "điểm 3 nghĩa là gì so
  với điểm 4". Hai Manager chấm cùng một người có thể lệch nhau lớn → đánh giá thiếu nhất
  quán, khó bảo vệ trước HR.
- Bộ tiêu chí mặc định hiện là 5 mục **chung chung** (Chất lượng công việc, Thái độ…),
  không phản ánh khung năng lực thực tế công ty đang dùng (file `Evaluation Framework`).
- Đánh giá hiện **không gắn bằng chứng**: nhận xét tự do (`strengths/weaknesses/comment`)
  nhưng không liên kết tới công việc/đầu ra cụ thể (task, PR, ticket).

## Quyết định discovery (đã chốt với người dùng 2026-06-10)

1. **Rubric gắn vào tiêu chí + popover hướng dẫn** *(Recommended — đã chọn)*
   Mở rộng `ProbationCriteria` thêm **rubric** = mảng 5 mức (ứng điểm 1–5), mỗi mức gồm
   `level` (nhãn), `definition` (định nghĩa ngắn), `observable` (biểu hiện quan sát).
   Tại scorecard, mỗi tiêu chí có nút **"Hướng dẫn"** mở **Popover** liệt kê 5 mức, **tô
   đậm mức tương ứng điểm đang chọn**. Rubric là tùy chọn (tiêu chí cũ/không có rubric vẫn
   chấm bình thường, chỉ ẩn nút hướng dẫn).

2. **Thay bộ tiêu chí mặc định bằng khung năng lực hiện đại (6 năng lực)** *(đã chọn)*
   Thay vì bê nguyên file gốc, bộ mặc định được **cập nhật từ thực tiễn 2025–2026 của các
   công ty lớn** (Google GRAD/"Googleyness", Amazon Leadership Principles, Netflix Keeper
   Test, Meta PSC, Microsoft "3 vòng tròn impact", Atlassian 3 trụ cột). Seed mới = **6 năng
   lực** kèm rubric 5 mức tiếng Việt (định nghĩa + biểu hiện quan sát):

   | # | Năng lực | Nhóm (group) |
   |---|----------|--------------|
   | 1 | **Chuyên môn & Tốc độ hòa nhập** (Job Knowledge & Ramp-Up) | PERFORMANCE |
   | 2 | **Chất lượng công việc** (Quality of Work) | PERFORMANCE |
   | 3 | **Chủ động & Sở hữu công việc** (Initiative & Ownership) | PERFORMANCE |
   | 4 | **Giao tiếp & Phối hợp** (Communication & Collaboration) | PERFORMANCE |
   | 5 | **Thích nghi & Học hỏi** (Adaptability & Learning Agility) | PERFORMANCE |
   | 6 | **Phù hợp văn hóa & Giá trị** (Culture & Values Fit) | VALUES |

3. **Tách "What/How" qua trường `group` trên tiêu chí** *(đã chọn)*
   Bài học cấu trúc chung của các framework lớn: **chấm "hiệu suất" (What) tách khỏi "giá
   trị/văn hóa" (How)** để tránh hiệu ứng hào quang. `ProbationCriteria` thêm `group`
   ∈ {`PERFORMANCE`, `VALUES`} (mặc định `PERFORMANCE`). Scorecard **nhóm tiêu chí theo
   group** và hiển thị **sub-score trung bình riêng** cho từng nhóm (Hiệu suất / Giá trị).
   Đây là tín hiệu hiển thị; **không** đổi cơ chế quyết định của HR (vẫn CONFIRM/EXTEND/FAIL).

4. **Có — thêm danh sách deliverable evidence** *(đã chọn)*
   Mở rộng `ProbationReview` thêm **deliverables** = mảng các mục bằng chứng: `title`
   (tên công việc/backlog), `link` (URL thật, vd ClickUp/Jira/PR), `outcome` (kết quả:
   Đạt / Vượt scope / Không đạt), `note` (nhận xét ngắn của Manager). Bám Sheet "Deliverable"
   của file framework gốc (Backlog | Review | Link).

## Cơ sở: nghiên cứu khung năng lực big-tech (2025–2026)

Các điểm chung rút ra (chi tiết nguồn ở cuối):
- **Tách What (impact/kết quả) khỏi How (hành vi/giá trị), chấm riêng** — Google, Meta,
  Microsoft, Atlassian đều làm vậy. → quyết định `group` ở trên.
- 6 luồng phổ biến: Impact/Kết quả · Chất lượng/Tiêu chuẩn cao · Phối hợp & nâng đỡ đồng
  đội · Sở hữu/Chủ động · Phù hợp văn hóa · Học hỏi/Tò mò.
- **Thử việc (90 ngày):** ưu tiên **tốc độ hòa nhập & học hỏi** hơn sản lượng đỉnh; coi
  thử việc là đánh giá **fit hai chiều**.
- **BARS chuẩn = 5 mức**, neo bằng **hành vi quan sát được, thì hiện tại** (phù hợp thang
  1–5 sẵn có của SPEC-030, không đổi).

> Bộ năng lực + rubric nằm hoàn toàn trong **dữ liệu seed** (defaults.ts) — HR vẫn sửa
> được sau qua UI cấu hình. File `Evaluation Framework.xlsx` gốc được dùng làm tham chiếu
> cho phần deliverable và đối chiếu rubric, không bê nguyên xi.

## Target Users

| User | Actions mới |
|------|-------------|
| **Super Admin / HR Manager** | Soạn/sửa **rubric** cho từng tiêu chí (`probation:configure`); xem rubric + deliverable khi đọc review |
| **Manager** | Khi chấm: mở **popover hướng dẫn** theo rubric; thấy **sub-score Hiệu suất / Giá trị** tách riêng; nhập **danh sách deliverable** làm bằng chứng (chỉ khi DRAFT) |
| **Employee** | Không truy cập (giữ nguyên SPEC-030) |

---

## Core Features

### 1. Rubric theo mức cho mỗi tiêu chí (ProbationCriteria.rubric)
**Acceptance Criteria:**
- [ ] `ProbationCriteria` thêm `rubric Json?` = mảng đúng 5 phần tử, mỗi phần tử
      `{ score: 1..5, level: string, definition: string, observable: string }`
- [ ] Validator (Zod) cả BE + FE: nếu có rubric thì **đúng 5 mức, score 1..5 không trùng**;
      `level` bắt buộc (≤120), `definition`/`observable` tùy chọn (≤2000)
- [ ] Rubric **tùy chọn** — tiêu chí không có rubric vẫn hợp lệ và chấm được như cũ
- [ ] `ProbationCriteriaDto` + create/update input mang theo `rubric`; mapper trả `rubric`

### 2. Seed mặc định = 6 năng lực hiện đại + group (Việt hóa)
**Acceptance Criteria:**
- [ ] `DEFAULT_PROBATION_CRITERIA` thay bằng **6 năng lực** (bảng ở phần discovery), mỗi tiêu
      chí có `group` (5 PERFORMANCE + 1 VALUES) và `rubric` 5 mức tiếng Việt (định nghĩa + biểu hiện)
- [ ] `seedProbationCriteriaForTenant` vẫn **idempotent** (chỉ seed khi tenant chưa có tiêu chí nào)
- [ ] **Không** tự sửa/migrate tiêu chí của tenant đã tồn tại (tránh ghi đè dữ liệu thật);
      bộ mới chỉ áp cho tenant mới seed lần đầu

### 2b. Nhóm tiêu chí (group) + sub-score What/How
**Acceptance Criteria:**
- [ ] `ProbationCriteria` thêm `group` ∈ {`PERFORMANCE`,`VALUES`}, mặc định `PERFORMANCE`
- [ ] Validator BE/FE chấp nhận `group`; mapper + DTO + create/update input mang theo `group`
- [ ] Scorecard **nhóm tiêu chí theo group** (mục "Hiệu suất" / "Giá trị") và hiển thị
      **điểm trung bình từng nhóm** (sub-score, `tabular-nums`, làm tròn 1 chữ số)
- [ ] Sub-score chỉ là **hiển thị** — không đổi luồng quyết định HR, không chặn submit

### 3. Popover hướng dẫn rubric tại scorecard (Manager)
**Acceptance Criteria:**
- [ ] Mỗi tiêu chí **có rubric** hiển thị nút **"Hướng dẫn"** (icon + aria-label) cạnh tên
- [ ] Mở **Popover** (Radix) liệt kê 5 mức: điểm · nhãn · định nghĩa · biểu hiện
- [ ] Mức **tương ứng điểm đang chọn được tô đậm** (highlight bằng token màu primary, không hex)
- [ ] Tiêu chí **không có rubric** → ẩn nút hướng dẫn (không vỡ layout)
- [ ] A11y: popover trap focus chuẩn Radix, đóng bằng Esc, nút có `aria-label`; reduced-motion

### 4. Danh sách deliverable bằng chứng (ProbationReview.deliverables)
**Acceptance Criteria:**
- [ ] `ProbationReview` thêm `deliverables Json?` = mảng
      `{ title: string, link?: string, outcome?: 'MET'|'EXCEEDED'|'NOT_MET', note?: string }`
- [ ] Validator: `title` bắt buộc (≤200); `link` nếu có phải là **URL hợp lệ** (≤500);
      `note` ≤1000; tối đa **50 mục**/review
- [ ] BE: deliverables nhận ở **patch** (lưu nháp) và **submit**; **bất biến sau submit**
      (cùng quy tắc immutability của scorecard SPEC-030 — chỉ DRAFT mới sửa)
- [ ] FE: trong Sheet, khu vực "Bằng chứng công việc" cho **thêm/xóa dòng** (title, link,
      outcome select, note) khi `DRAFT`; **chỉ đọc** khi `PENDING_HR`/`DECIDED`
- [ ] HR đọc review thấy danh sách deliverable + link mở tab mới (`rel="noopener noreferrer"`)

### 5. Cấu hình rubric trong tab tiêu chí (HR)
**Acceptance Criteria:**
- [ ] Dialog tạo/sửa tiêu chí (`ProbationCriteriaSettings`) thêm **chọn group** (Hiệu suất /
      Giá trị) + khu vực soạn **rubric 5 mức** (5 hàng cố định ứng điểm 1..5: ô nhãn + định
      nghĩa + biểu hiện), gate `probation:configure`
- [ ] Lưu rubric rỗng = không có rubric (gửi `null`); sửa lại điền đủ = bật lại hướng dẫn
- [ ] Pattern UI bám design system (Dialog hiện có, token, dark mode, i18n)

---

## Data Model (bổ sung — Prisma, **chỉ thêm cột Json, không bảng mới**)

```prisma
model ProbationCriteria {
  // ... giữ nguyên SPEC-030 ...
  group     String   @default("PERFORMANCE") // 'PERFORMANCE' | 'VALUES' — tách What/How
  rubric    Json?    // [{ score:1..5, level, definition?, observable? }] — 5 mức; null = không có hướng dẫn
}

model ProbationReview {
  // ... giữ nguyên SPEC-030 ...
  deliverables Json? // [{ title, link?, outcome?:'MET'|'EXCEEDED'|'NOT_MET', note? }] — bằng chứng, bất biến sau submit
}
```

> `group` dùng **String + default** (không tạo Prisma enum) để dễ mở rộng nhóm sau này và
> migration chỉ `ADD COLUMN ... DEFAULT 'PERFORMANCE'` (backfill mặc định an toàn cho dữ
> liệu cũ). Giá trị hợp lệ kiểm soát qua const `ProbationCompetencyGroup` ở shared + Zod enum.

> Lý do dùng `Json` thay vì bảng mới: nhất quán với pattern `ratings Json?` của SPEC-030;
> rubric/deliverable luôn đọc-ghi cả khối theo criteria/review, không cần query lẻ từng dòng.
> Migration chỉ `ADD COLUMN` nullable → **an toàn, không backfill, không phá dữ liệu cũ**.

## Shared types (bổ sung — `packages/shared/src/types/probation.ts`)

```ts
export const ProbationCompetencyGroup = { PERFORMANCE:'PERFORMANCE', VALUES:'VALUES' } as const;
export type ProbationCompetencyGroup = (typeof ProbationCompetencyGroup)[keyof typeof ProbationCompetencyGroup];

export const ProbationDeliverableOutcome = { MET:'MET', EXCEEDED:'EXCEEDED', NOT_MET:'NOT_MET' } as const;
export type ProbationDeliverableOutcome = (typeof ProbationDeliverableOutcome)[keyof typeof ProbationDeliverableOutcome];

export interface ProbationRubricLevel { score: number; level: string; definition?: string; observable?: string; }
export interface ProbationDeliverable { title: string; link?: string | null; outcome?: ProbationDeliverableOutcome | null; note?: string | null; }

// ProbationCriteriaDto + Create/Update inputs: thêm `group: ProbationCompetencyGroup` + `rubric?: ProbationRubricLevel[] | null`
// ProbationReviewDto: thêm `deliverables: ProbationDeliverable[] | null`
// Patch/Submit input: thêm `deliverables?: ProbationDeliverable[]`
```

## API (không thêm endpoint — mở rộng payload các endpoint SPEC-030)

| Endpoint | Thay đổi |
|----------|----------|
| POST/PATCH `/probation/criteria[/:id]` | nhận thêm `group` + `rubric` (validate 5 mức nếu có) |
| GET `/probation/criteria` | trả `group` + `rubric` trong mỗi tiêu chí |
| PATCH `/probation/reviews/:id` | nhận thêm `deliverables` (chỉ DRAFT) |
| POST `/probation/reviews/:id/submit` | nhận thêm `deliverables`; lưu kèm; bất biến sau đó |
| GET `/probation/reviews[/:id]` | trả `deliverables` |

Permission giữ nguyên SPEC-030 (configure/review/view). Tenant-scoped, MANAGER scope ở service.

## Tái sử dụng & không phá vỡ

| Thành phần | Chiến lược |
|-----------|-----------|
| Thang điểm 1–5, status machine, decide side-effects (SPEC-030) | **Không đổi** |
| `ratings Json` pattern | **Mirror** cho `rubric` (criteria) và `deliverables` (review) |
| Immutability sau submit | **Áp dụng nguyên** cho deliverables (chỉ DRAFT sửa) |
| `requireEditableDraft`, scope MANAGER | **Tái dùng** — không thêm đường validate mới |
| Popover/Dialog/Select shadcn | **Tái dùng** component sẵn có |

## Out of scope (iteration sau)

- Trọng số (weight) tiêu chí / điểm tổng có trọng số
- Tự fetch metadata task từ ClickUp/Jira qua link (hiện chỉ lưu URL + nhận xét tay)
- Upload file đính kèm cho deliverable
- Versioning lịch sử rubric (sửa rubric không ảnh hưởng review đã DECIDED vì ratings là điểm thô)
- Self-view EMPLOYEE (vẫn loại như SPEC-030)
- Phân tích/biểu đồ năng lực theo thời gian

## Non-functional

- Migration chỉ `ADD COLUMN` Json nullable → an toàn, tương thích ngược (review cũ: `deliverables=null`)
- RBAC server-side giữ nguyên; validate rubric/deliverable **cả BE (Zod) lẫn FE (RHF/Zod)**
- TDD: validator rubric (đúng 5 mức/score), validator deliverable (URL/giới hạn), immutability deliverables sau submit, seed mới idempotent
- E2E critical path mở rộng: Manager mở popover hướng dẫn → chấm theo rubric → thêm 1 deliverable có link → nộp → HR đọc thấy deliverable (assert hiển thị link)
- WCAG AA (popover focus, contrast highlight), dark mode, i18n vi+en bổ sung khóa, design token (no hex), responsive 768–1440

## Boundaries

### Always Do
- Giữ thang điểm 1–5 và toàn bộ luồng SPEC-030 nguyên vẹn
- Rubric & deliverables **tùy chọn** — thiếu vẫn chấm/nộp được (tương thích ngược)
- Validate đúng 5 mức rubric (score 1..5) và URL hợp lệ cho link deliverable ở **server**
- Deliverables **bất biến sau submit** (chỉ DRAFT sửa)
- Migration nullable, không backfill, không đổi nghĩa cột cũ

### Never Do
- Không tạo bảng mới (dùng cột Json)
- Không tự ý ghi đè/migrate tiêu chí của tenant đã có dữ liệu khi đổi seed
- Không cho sửa deliverables/scorecard sau khi nộp
- Không hardcode rubric trong component (rubric đến từ dữ liệu `ProbationCriteria`)
- Không dùng hex màu cho highlight rubric (chỉ token)

---

## Nguồn tham khảo (khung năng lực big-tech & BARS, 2025–2026)

- [Google GRAD system explained (Acciyo)](https://www.acciyo.com/employee-performance-reviews-at-google-grad-system-explained/)
- [Amazon Leadership Principles (About Amazon)](https://www.aboutamazon.com/about-us/leadership-principles)
- [Netflix Culture Memo (Netflix Jobs)](https://jobs.netflix.com/culture)
- [Meta PSC performance dimensions (Lodely)](https://www.lodely.com/blog/meta-psc)
- [Microsoft performance reviews — Three Circles of Impact (Deel)](https://www.deel.com/blog/employee-performance-reviews-at-microsoft/)
- [Atlassian's performance reviews framework (Work Life by Atlassian)](https://www.atlassian.com/blog/hr-teams/our-performance-reviews-framework)
- [90 Day Review Template & competencies (AIHR)](https://www.aihr.com/blog/90-day-review-template/)
- [30-60-90 Day Performance Review Guide (Engagedly)](https://engagedly.com/blog/the-ultimate-guide-to-30-60-90-day-performance-review-and-templates/)
- [Behaviorally Anchored Rating Scale guide (People Managing People)](https://peoplemanagingpeople.com/performance-management/behaviorally-anchored-rating-scale/)
- [BARS examples by competency (Deel)](https://www.deel.com/blog/behaviorally-anchored-rating-scale-examples/)
```