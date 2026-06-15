# TODO: SPEC-023 — Overtime Multi-step Approval Flow

> Chi tiết: `tasks/023-overtime-approval-flow-plan.md` · Spec: `docs/specs/023-overtime-approval-flow.md`

## Phase 1: Foundation — Schema + Shared types
- [x] 1.1 schema.prisma: `enum ApprovalFlowType { LEAVE OVERTIME }`
- [x] 1.2 schema.prisma: ApprovalFlow thêm `flowType` + relation `otRequests`; đổi unique → `[tenantId, departmentId, flowType]`
- [x] 1.3 schema.prisma: OvertimeRequest thêm `flowId`, `currentStep`, relation `flow`/`approvals`, index `[flowId]`
- [x] 1.4 schema.prisma: OvertimeStatus thêm `RETURNED`
- [x] 1.5 schema.prisma: model mới `OvertimeApproval` (clone LeaveApproval)
- [x] 1.6 Migration `overtime_approval_flow` (default flow_type=LEAVE cho dữ liệu cũ)
- [x] 1.7 shared/leave.ts: ApprovalFlowDto +flowType; ApprovalFlowType const (flowType do route quyết định, không nhận từ body)
- [x] 1.8 shared/timesheet.ts: OvertimeStatus +RETURNED; OvertimeRequestDto +flowId/currentStep/approvals; OvertimeApprovalDto

### ✅ Checkpoint A — migration sạch, typecheck 3 package pass, 778/778 test API pass (Leave không regression)

## Phase 2: Cấu hình OT flow (backend) [RBAC]
- [x] 2.1 approval-flow.repository.ts: thêm tham số `flowType` (mặc định LEAVE)
- [x] 2.2 approval-flow.service.ts: single-default check theo `[tenant, dept, flowType]`
- [x] 2.3 timesheet.controller.ts: flow CRUD controllers (flowType=OVERTIME)
- [x] 2.4 timesheet.routes.ts: `/overtime/flows` CRUD + `/steps` — `requirePermission('timesheet:configure')`
- [x] 2.5 Verify RBAC: HR OK; MANAGER/EMPLOYEE → 403; Leave flow không đổi (integration test `overtime-flow.test.ts`, 782/782 pass)

## Phase 3: Routing submit/resubmit (RISK)
- [x] 3.1 overtime.repository.ts: `requestDetailInclude` + `createWithApprovals` (transaction)
- [x] 3.2 overtime.service.ts: `submit()` resolveFlow(OVERTIME) → snapshot hoặc legacy; auto-skip-all → APPROVED + multiplier
- [x] 3.3 overtime.service.ts: `resubmit()` round+1, re-validate, re-resolve
- [x] 3.4 overtime.repository.ts: `resubmit` (transaction, giữ round cũ)

## Phase 4: Decision engine per-step (RISK) [RBAC]
- [x] 4.1 overtime.service.ts: `decide()` phân nhánh legacy vs step
- [x] 4.2 `approveStep` advance/finalize + snapshot multiplier tại bước cuối
- [x] 4.3 `returnStep` RETURNED + note bắt buộc
- [x] 4.4 `legacyReview` giữ approve/reject cũ (flowId null)
- [x] 4.5 overtime.repository.ts: `recordDecision` (transaction) + `findReviewCandidates`
- [x] 4.6 timesheet.controller.ts: `buildApprovalActor()` + approve/reject dùng actor; `requirePermission('timesheet:approve')`

### ✅ Checkpoint B — vòng đời OT đầy đủ qua API; typecheck sạch, 782/782 test API pass (Leave không regression)

## Phase 5: Review queue + chi tiết timeline [RBAC]
- [x] 5.1 service/repo: `listReviewQueue(actor)` lọc theo current-step approver (findReviewCandidates + isActorCurrentApprover, paginate in-memory)
- [x] 5.2 timesheet.controller.ts: `getOvertime(:id)` + `resubmitOvertime` + listTeamOvertime (default=queue, scope=all gated bởi requireReviewCapability)
- [x] 5.3 timesheet.routes.ts: `GET /overtime/:id` (timesheet:view) + `PATCH /overtime/:id/resubmit` (timesheet:create, ownership)
- [x] 5.4 mappers.ts: toOvertimeRequestDto thêm flowId/currentStep/approvals (đã xong ở Phase 1)

## Phase 6: Frontend (UI nhân bản OT-variant)
- [x] 6.1 useOvertime.ts: useResubmitOvertime, useOvertimeRequest(id), OT flow hooks
- [x] 6.2 OvertimeTimeline.tsx (nhân bản LeaveTimeline, ns timesheet)
- [x] 6.3 OvertimeFlowSettings.tsx (nhân bản ApprovalFlowSettings → /overtime/flows)
- [x] 6.4 Gắn vào TimesheetSettingsPage (gate timesheet:configure)
- [x] 6.5 MyOvertime: badge RETURNED + nút Nộp lại + mở timeline
- [x] 6.6 TeamOvertime: queue theo current-step + Duyệt/Trả về (note)
- [x] 6.7 i18n vi/en timesheet.json

### ✅ Checkpoint C — UI golden path verify bằng screenshot; RBAC + 403 đúng; dark mode
> Verify (06/06): OvertimeFlowSettings create→list→persist (DB flowType=OVERTIME, steps [0:MANAGER,1:DEPARTMENT_HEAD]).
> Vòng đời đầy đủ trên user thật: Linh (EMP-003) gửi OT 3h → timeline bước1 MANAGER pending + bước2 auto-skip DUPLICATE_APPROVER;
> Tuấn (MANAGER) review queue OT-variant (flow → Duyệt/Trả về; legacy → Duyệt/Từ chối) → Trả về (note bắt buộc) → DB RETURNED;
> Linh thấy badge "Đã trả về" + Nộp lại → resubmit round+1 (DB round2 MANAGER pending, giữ round1) → timeline multi-round (LẦN GỬI 1/2). Light + dark OK.

## Phase 7: Tests (TDD + critical-path E2E)
- [x] 7.1 Unit: snapshot/auto-skip, advance/finalize, return round+1, legacy fallback, multiplier-at-final (overtime.service.test.ts, 28 pass)
- [x] 7.2 Integration: RBAC /overtime/flows + approve/return đúng/sai actor (overtime-flow.test.ts)
- [x] 7.3 E2E critical-path: flow 2 bước + 3 user → APPROVED + assert multiplier set (overtime-flow.test.ts, 11 pass)

### ✅ Checkpoint D — E2E xanh, không regression Leave → Ship
> Verify (06/06): full suite 800/800 pass (62 files). Lifecycle 3-user: EMP submit→PENDING currentStep1; EMP approve 403 (no perm); HR approve@step1 403 NOT_CURRENT_APPROVER; MGR approve→currentStep2 multiplier null; HR final→APPROVED multiplier set (>0); return(note)→RETURNED→resubmit round+1 timeline. Leave không đổi.
