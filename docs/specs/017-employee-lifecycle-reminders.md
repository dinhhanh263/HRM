# SPEC-017: Employee Lifecycle Reminders (Probation & Contract Expiry)

**Status:** Draft
**Created:** 2026-06-04
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee Management), SPEC-003 (Authorization/RBAC), SPEC-009 (Dashboard Data Integration), SPEC-006 (Bulk Import — BullMQ/email infra reused)

---

## Objective

Nhắc HR/quản lý về hai mốc vòng đời nhân sự quan trọng theo luật lao động VN:
**(1) sắp hết hạn thử việc** và **(2) sắp hết hạn hợp đồng lao động**. Reminder
hiển thị trên **Dashboard → Upcoming Events** (pull) và được **đẩy chủ động** qua
**email + thông báo in-app** (push, chạy hằng ngày). Nền tảng dữ liệu chưa tồn tại
nên iteration này bổ sung field `probationEndDate`, model `Contract` đầy đủ, và
model `Notification` cho in-app.

## Target Users

| Role | Nhận reminder gì |
|------|------------------|
| **HR_MANAGER / SUPER_ADMIN** | Toàn công ty — mọi nhân viên sắp hết thử việc / hết hạn HĐ. **Chỉ nhóm này** nhận reminder (email + in-app) và thấy event trên dashboard |
| **MANAGER** | **Không** — dữ liệu thử việc/HĐ là HR-only iteration này |
| **EMPLOYEE** | **Không** thấy reminder thử việc/HĐ của người khác (dữ liệu nhạy cảm). Có thể thấy *của chính mình* — xem Out of Scope |

---

## Scope decisions (confirmed với người dùng 2026-06-04)

1. **Thử việc:** thêm field rõ ràng `Employee.probationEndDate` (HR nhập tay), không suy ra từ `joinDate`.
2. **Hợp đồng:** tạo **model `Contract` đầy đủ** (loại, ngày bắt đầu/kết thúc, trạng thái, lịch sử) — không chỉ một field.
3. **Kênh nhắc:** Dashboard Upcoming Events **+ email + in-app** (cron hằng ngày qua BullMQ).
4. **Lead time:** thử việc nhắc trước **7 ngày**, hết hạn HĐ nhắc trước **30 ngày**.
5. **Recipients:** **chỉ HR** (HR_MANAGER / SUPER_ADMIN, tức user có `employees:update`). Không gửi cho quản lý trực tiếp. Dữ liệu thử việc/HĐ là **HR-only** → event dashboard cũng chỉ hiện cho scope `company`.
6. **Giao hàng:** làm **trọn một lần** (không tách Phase A/B).

---

## Core Features

### 1. Probation end date trên Employee
**Acceptance Criteria:**
- [ ] Thêm `Employee.probationEndDate DateTime? @map("probation_end_date")` (nullable; chỉ ý nghĩa khi nhân viên đang thử việc)
- [ ] Hiển thị + chỉnh sửa trong Employee profile/edit (Sheet) — HR nhập tay, có thể để trống
- [ ] Validate: nếu có thì `probationEndDate >= joinDate`

### 2. Contract model + CRUD (HR)
**Acceptance Criteria:**
- [ ] Model `Contract` (schema bên dưới); một nhân viên có nhiều HĐ theo thời gian, tối đa **một** HĐ `ACTIVE`
- [ ] `endDate = null` ⇒ **HĐ không xác định thời hạn** (không bao giờ sinh reminder hết hạn)
- [ ] Tab **"Hợp đồng"** trong Employee profile: list HĐ (mới nhất trước), thêm/sửa/kết thúc HĐ
- [ ] CRUD endpoints tenant-scoped, sau `requirePermission('contracts:*')`
- [ ] Khi tạo HĐ `ACTIVE` mới, HĐ `ACTIVE` cũ (nếu có) chuyển `EXPIRED` (một active duy nhất — đảm bảo trong transaction)

### 3. Notification model + in-app feed
**Acceptance Criteria:**
- [ ] Model `Notification` (schema bên dưới), gắn với `userId` (người nhận)
- [ ] `GET /api/v1/notifications` — chỉ trả thông báo của chính caller (scope theo `userId`), mới nhất trước, phân trang
- [ ] `PATCH /api/v1/notifications/:id/read` và `POST /api/v1/notifications/read-all` — đánh dấu đã đọc
- [ ] Header chuông 🔔 với badge số chưa đọc; dropdown danh sách; click điều hướng tới employee/contract liên quan
- [ ] **Idempotent:** mỗi lần nhắc (recipient × occurrence) chỉ tạo đúng **một** notification — dùng `dedupeKey` unique

### 4. Daily reminder scan (push: email + in-app)
**Acceptance Criteria:**
- [ ] Repeatable BullMQ job `reminders.scan` chạy mỗi ngày ~**07:00 GMT+7** (cron pattern + tz)
- [ ] Quét **mọi tenant**:
  - Nhân viên `ACTIVE` có `probationEndDate` ∈ [hôm nay, hôm nay+**7**] (mốc ngày tính theo **GMT+7**)
  - HĐ `ACTIVE` có `endDate != null` và ∈ [hôm nay, hôm nay+**30**]
- [ ] Với mỗi mốc → **recipients = chỉ user HR** (có `employees:update`) trong tenant đó. Tạo Notification (idempotent) + gửi email. Không gửi cho quản lý trực tiếp
- [ ] Email gửi qua queue fan-out riêng để có **retry/backoff** (theo pattern invite worker); thiếu `RESEND_API_KEY` ⇒ no-op + log warning (không throw)
- [ ] Chạy scan **hai lần trong cùng ngày không tạo thêm** notification/email trùng (dedupeKey)
- [ ] Workers đóng gọn khi `SIGTERM/SIGINT` (giống import/invite workers trong `server.ts`)

### 5. Dashboard Upcoming Events — 2 loại mới
**Acceptance Criteria:**
- [ ] `DashboardEventKind` thêm `'probation_ending' | 'contract_expiring'`
- [ ] `deriveUpcomingEvents` hỗ trợ **cửa sổ theo từng loại**: birthday/anniversary/new_joiner = 30 ngày (giữ nguyên), probation_ending = 7, contract_expiring = 30
- [ ] `findEventSourceEmployees` select thêm `probationEndDate` + `endDate` của HĐ `ACTIVE`
- [ ] Hai loại mới **chỉ** xuất hiện khi scope là `company` (HR/SUPER_ADMIN) — **không** lọt vào scope `team` (MANAGER) hay `self` (EMPLOYEE), vì dữ liệu HR-only
- [ ] Frontend: 2 entry `EVENT_STYLE` (icon Lucide + màu token), key i18n vi/en; format ngày DD/MM (không lệch tz)

---

## Data model (Prisma)

```prisma
// Employee: thêm 1 field
model Employee {
  // ... fields hiện có
  probationEndDate DateTime? @map("probation_end_date")
  contracts        Contract[] @relation("EmployeeContracts")
}

enum ContractStatus {
  ACTIVE
  EXPIRED
  TERMINATED
}

model Contract {
  id         String         @id @default(cuid())
  tenantId   String         @map("tenant_id")
  employeeId String         @map("employee_id")
  type       ContractType                                  // tái dùng enum hiện có
  startDate  DateTime       @map("start_date")
  endDate    DateTime?      @map("end_date")               // null = không xác định thời hạn
  status     ContractStatus @default(ACTIVE)
  signedAt   DateTime?      @map("signed_at")
  note       String?
  createdAt  DateTime       @default(now()) @map("created_at")
  updatedAt  DateTime       @updatedAt @map("updated_at")

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation("EmployeeContracts", fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([tenantId, employeeId])
  @@index([tenantId, status, endDate])   // hỗ trợ scan reminder theo hạn
  @@map("contracts")
}

model Notification {
  id         String    @id @default(cuid())
  tenantId   String    @map("tenant_id")
  userId     String    @map("user_id")                    // người nhận
  kind       String                                       // 'probation_ending' | 'contract_expiring'
  title      String
  body       String
  entityType String?   @map("entity_type")                // 'employee' | 'contract'
  entityId   String?   @map("entity_id")
  dedupeKey  String    @map("dedupe_key")                 // vd 'probation_ending:{empId}:{YYYY-MM-DD}'
  readAt     DateTime? @map("read_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dedupeKey])                           // idempotency của scan
  @@index([tenantId, userId, readAt])
  @@map("notifications")
}
```

> `dedupeKey` gồm mốc ngày đáo hạn ⇒ nếu HR dời `probationEndDate`/`endDate`, một
> reminder mới (key khác) được tạo cho mốc mới; mốc cũ không bị gửi lại.

---

## API

| Method & path | Permission | Ghi chú |
|---|---|---|
| `GET /api/v1/employees/:id/contracts` | `contracts:view` | List HĐ của 1 nhân viên (tenant-scoped; HR-only) |
| `POST /api/v1/employees/:id/contracts` | `contracts:create` | Tạo HĐ; nếu `ACTIVE` thì hạ HĐ active cũ → `EXPIRED` (transaction) |
| `PATCH /api/v1/contracts/:id` | `contracts:update` | Sửa HĐ |
| `DELETE /api/v1/contracts/:id` | `contracts:delete` | Xóa HĐ (HR) |
| `GET /api/v1/notifications?page=&limit=` | `notifications:view` | Chỉ của caller (`userId`); kèm `unreadCount` |
| `PATCH /api/v1/notifications/:id/read` | `notifications:view` | Chỉ sửa được notification của chính mình |
| `POST /api/v1/notifications/read-all` | `notifications:view` | Đánh dấu tất cả đã đọc |

`Employee.probationEndDate` đi qua endpoint update employee đã có (mở rộng Zod schema).
`DashboardData.upcomingEvents` mở rộng union kind (SPEC-009 hợp đồng).

**Shared DTO (`packages/shared`):**
```ts
type DashboardEventKind =
  | 'birthday' | 'anniversary' | 'new_joiner'
  | 'probation_ending' | 'contract_expiring';

interface ContractDto {
  id: string; employeeId: string; type: ContractType;
  startDate: string; endDate: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  signedAt: string | null; note: string | null;
}

interface NotificationDto {
  id: string; kind: string; title: string; body: string;
  entityType: string | null; entityId: string | null;
  readAt: string | null; createdAt: string;
}
```

## Permissions (mở rộng `apps/api/src/domain/rbac/catalog.ts`)

- Resource mới `contracts`: `view`, `create`, `update`, `delete`
  - SUPER_ADMIN (implicit-all), HR_MANAGER → đủ 4
  - MANAGER, EMPLOYEE → không (HĐ là HR-only iteration này; "HĐ của tôi" xem Out of Scope)
- Resource mới `notifications`: `view`
  - Cấp cho **mọi** role; data luôn scope theo `userId` của caller trong service (mọi role đều có thể nhận notification hệ thống sau này)

> Reminder thử việc/HĐ chỉ sinh notification cho user HR — không phụ thuộc việc role
> khác có `notifications:view`. Scope dữ liệu enforce **trong service**, không chỉ bằng key.

---

## Technical Approach

**Backend** (`apps/api/`)
- Migration Prisma: thêm `probationEndDate`, model `Contract` + `ContractStatus`, model `Notification` (+ quan hệ trên `Tenant`, `User`, `Employee`)
- `contract.repository.ts` / `contract.service.ts` / `contract.controller.ts` + routes; transaction cho quy tắc "một ACTIVE duy nhất"
- `notification.repository.ts` / `notification.service.ts` / `notification.controller.ts` + routes; mọi query bắt buộc filter `userId = caller`
- **Reminder engine** `domain/reminders/`:
  - `reminders.queue.ts` — repeatable job (cron `0 0 * * *` theo tz Asia/Ho_Chi_Minh, ≈07:00 local tùy cấu hình) + `reminder-email` queue (retry/backoff)
  - `reminders.scan.worker.ts` — quét probation/contract trong window theo **GMT+7** (tái dùng helper offset GMT+7 đã có trong timesheet), recipients = **chỉ user HR** (`employees:update`) của tenant, tạo Notification idempotent, fan-out email
  - `reminder-email.worker.ts` — gửi email qua `emailProvider`
  - Khởi động + graceful shutdown trong `server.ts` cạnh import/invite workers
- `EmailProvider`: thêm `sendProbationReminder` / `sendContractReminder` (HTML inline, `escapeHtml` cho giá trị người dùng — theo pattern hiện có)
- Dashboard: mở rộng `findEventSourceEmployees` + `deriveUpcomingEvents` (window theo kind; 2 kind nhạy cảm **chỉ** ở scope `company`, lọc khỏi `team`/`self`)

**Frontend** (`apps/web/`)
- `features/contracts/` (hoặc lồng trong `features/employees/`): tab Hợp đồng, list + Sheet thêm/sửa/kết thúc; TanStack Query hooks; Zod + RHF
- `features/notifications/`: chuông header + badge unread + dropdown; `useNotifications`, `useMarkRead`; optimistic mark-read
- Employee edit Sheet: thêm field `probationEndDate` (date input)
- Dashboard: 2 entry `EVENT_STYLE` + i18n; reuse `EventItem`
- i18n vi/en cho contracts + notifications + 2 event mới; dark mode; WCAG AA; `aria-label` cho chuông; `tabular-nums`; không hex

**Reuse hạ tầng có sẵn:** `infrastructure/queue/connection.ts`, `emailProvider`,
pattern queue/worker của `employee-import`, helper offset GMT+7 của timesheet.

## Code Style
- Theo `.claude/rules/` — RBAC server-side end-to-end ([feedback_rbac-new-screen]),
  TanStack Query (không `fetch` trong component), Zod cả client/server, Prisma
  singleton + transaction, tenant-scope mọi query, i18n keys, không `any`.

## Testing Strategy
> Theo [feedback_coverage-not-proof]: không đo bằng %; viết test critical-path
> **khẳng định kết quả nghiệp vụ**, seed đủ state để hiệu ứng quan sát được.

- **Unit (api):**
  - `deriveUpcomingEvents` — window theo từng kind (probation 7 / contract 30), HĐ `endDate=null` **không** sinh event, năm-rollover của birthday/anniversary giữ nguyên
  - Reminder scan selection — trong/ngoài window (biên ±1 ngày theo GMT+7), bỏ qua nhân viên không ACTIVE, bỏ qua HĐ không xác định thời hạn
  - Quy tắc "một ACTIVE duy nhất" khi tạo HĐ mới
- **Integration (api):**
  - Contract CRUD: 403 khi thiếu `contracts:*` (kể cả MANAGER/EMPLOYEE — HR-only); tenant isolation
  - Notifications: caller chỉ đọc/sửa được của chính mình (không truy cập chéo userId/tenant)
  - Dashboard payload: **chỉ** HR/SUPER_ADMIN có 2 kind mới; MANAGER (team) và EMPLOYEE (self) **không** thấy probation/contract
- **Critical-path E2E (khẳng định outcome):**
  - Seed 1 nhân viên `probationEndDate = hôm nay+5`, 1 user HR (+1 MANAGER để chứng minh không nhận) → chạy `reminders.scan` →
    **assert** có đúng 1 `Notification(kind='probation_ending')` cho **user HR** và **0** cho MANAGER **và** email provider được gọi đúng 1 lần (tới HR)
  - Chạy scan lần 2 cùng ngày → **vẫn đúng 1** notification/email (idempotency qua `dedupeKey`)
  - Tương tự cho HĐ `endDate = hôm nay+20` (trong cửa sổ 30)

## Boundaries

### Always Do
- Enforce `contracts:*` / `notifications:view` **và** scope dữ liệu (team/company, hoặc `userId` cho notifications) ở **server**
- Tenant-scope mọi query; mọi mốc ngày tính theo **GMT+7**
- Idempotent reminder (dedupeKey); email no-op khi thiếu key (không throw)
- Skeleton khi load, empty state có CTA, dark mode + i18n + a11y; `escapeHtml` trong email

### Ask First
- Đổi cron schedule / lead time khác 7 & 30 ngày
- Mở reminder cho MANAGER (team) hoặc EMPLOYEE (HĐ của chính họ) — hiện HR-only
- Thêm kênh khác (Slack, push mobile) hoặc digest gộp nhiều mốc vào 1 email

### Never Do
- Lộ probation/contract cho MANAGER hoặc EMPLOYEE (kể cả qua dashboard scope team/self)
- Gửi trùng reminder (bỏ qua dedupe) hoặc gửi lặp mỗi lần scan
- Tính scope chỉ ở client; hex literal, inline style, `fetch` trong component, `any`
- Log nội dung nhạy cảm (lương/HĐ/PII) trong logger

## Out of Scope (future)
- MANAGER xem HĐ/thử việc của team; EMPLOYEE self-service xem HĐ & ngày hết thử việc của *chính mình* (cần quyết định quyền riêng)
- Tự động chuyển HĐ → `EXPIRED` đúng ngày hết hạn (job dọn trạng thái) — iteration này chỉ nhắc
- Logic luật VN nâng cao: chặn ký quá 2 HĐ xác định thời hạn, tự đề xuất HĐ vô thời hạn
- Notification real-time (WebSocket/SSE) — MVP dùng polling khi mở dropdown
- Digest email gộp, cấu hình lead time theo tenant, đính kèm file HĐ (S3)
- Đồng bộ `Employee.contractType` ↔ HĐ ACTIVE (giữ độc lập iteration này)

## Non-functional
- Scan job O(số mốc trong window) nhờ index `[tenantId, status, endDate]`; không N+1
- Notification feed phân trang; badge unread qua `count`
- Interaction < 100ms (optimistic mark-read); WCAG AA, dark mode, vi + en

---

## Next Step
Sau khi duyệt, chạy `/plan` để tách thành các vertical slice. Làm **trọn một lần**,
thứ tự đề xuất:
1. Migration + Prisma (probationEndDate, Contract, Notification)
2. Contract CRUD (BE + tab FE), HR-only
3. Notification model + feed (BE + chuông FE)
4. Reminder engine (scan + email/in-app, idempotent, recipients = HR) + tests outcome
5. Dashboard 2 event kind mới — scope company (BE derive + FE style/i18n)
