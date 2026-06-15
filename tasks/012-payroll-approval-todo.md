# TODO-012: Payroll Approval Workflow (Maker-Checker)

> Plan: [012-payroll-approval-plan.md](012-payroll-approval-plan.md) · Spec: [docs/specs/012-payroll-approval-workflow.md](../docs/specs/012-payroll-approval-workflow.md)

## Slice 0: Nền tảng (enum / permission / role)
- [x] 0.1 `packages/shared`: +`payroll:approve`, +`UserRole.PAYROLL_APPROVER`, +`PayrollRunStatus.PENDING_APPROVAL`, +`PayrollRunDto.submittedById/submittedAt`
- [x] 0.2 Prisma: +enum values, +`PayrollRun.submittedById/submittedAt`; migration `20260603013433_add_payroll_approval`
- [x] 0.3 `catalog.ts`: HR giữ process/export (không approve); +SystemRoleDef `payroll_approver`
- [x] 0.4 `mappers.ts` (+submitted*) + `payroll.validator.ts` (status enum +PENDING_APPROVAL) cập nhật
- [x] 0.5 `rbac-catalog.test.ts` (9 xanh); migration apply + `db:seed` idempotent (2 lần); `pnpm typecheck` toàn repo pass

## ✅ Checkpoint A — Nền tảng sẵn sàng (DONE: HR=process/export/view, approver=approve/view, 7 tenant)

## Slice 1: HR "Gửi duyệt" (DRAFT → PENDING_APPROVAL)
- [x] 1.1 (RED) integration test: submit DRAFT→PENDING; recompute PENDING→409; approver submit→403
- [x] 1.2 service `submit` + repo `submit` (guard DRAFT && payslips>0)
- [x] 1.3 controller `submitRun` + route `POST /runs/:id/submit` (gate `payroll:process`)
- [x] 1.4 FE: `useSubmitRun`; RunsSheet action `submit` cho DRAFT; badge `PENDING_APPROVAL`; i18n vi
- [x] 1.5 (GREEN) test xanh; manual gửi duyệt (UI verified: menu [Tính lại, Gửi duyệt, Hủy], dialog vi, submit→Chờ duyệt, HR mất action khi PENDING; light+dark)

## Slice 2: Approver "Duyệt / Trả về" (PENDING_APPROVAL → APPROVED | DRAFT)
- [x] 2.1 (RED) integration test: approver approve PENDING→APPROVED; HR approve→403; submitter==approver→403; reject→DRAFT; approver GET runs→200
- [x] 2.2 service `approve` đổi guard PENDING-only + chặn self-approval; service `reject`
- [x] 2.3 repo `approve` guard đổi + `reject` (không thêm cột reject-note — tránh scope creep)
- [x] 2.4 routes: `approve`/`reject` → `payroll:approve`; mở `GET /runs`,`/runs/:id` cho process+approve; controller `rejectRun`
- [x] 2.5 FE: `useRejectRun`; RunsSheet PENDING_APPROVAL lọc theo quyền (approver→[Duyệt, Trả về], HR→[Hủy]); **PayrollPage: mở tab "Kỳ lương" cho `payroll:approve`** (gap đã sửa — approver trước đó rơi vào MyPayslips, không tới được RunsSheet); badge `whitespace-nowrap`; i18n vi
- [x] 2.6 (GREEN) api 524 + web 314 test xanh; manual verified với user PAYROLL_APPROVER thật: approve→Đã duyệt, reject→Nháp (clear submittedBy/At), HR chỉ thấy [Hủy] trên PENDING, light+dark

## ✅ Checkpoint B — Maker-checker server-enforced (DONE)

## Slice 3: Email cho người duyệt
- [x] 3.1 repo `findApproverRecipients`: user ACTIVE trong tenant có `payroll:approve` (trừ submitter theo employeeId)
- [x] 3.2 `email.provider`: `sendPayrollApprovalRequest` + html (period/headcount/net/link); export `createEmailProvider` để test keyless
- [x] 3.3 `submit` gọi `notifyApprovers` sau commit, best-effort (no-key→warn; lỗi→per-recipient .catch log, không rollback)
- [x] 3.4 test: provider no-op khi không key (`createEmailProvider('')`); submit vẫn 200 khi email lỗi; `tests/setup.ts` ép `RESEND_API_KEY=''` chặn gửi thật → 527 api test xanh

## Slice 4: Polish (i18n EN, role i18n, a11y, regression)
- [x] 4.1 `en/payroll.json`: +PENDING_APPROVAL status, +submit/reject (actions/confirm/toast) — đồng bộ với vi
- [x] 4.2 `{vi,en}/role.json`: +`payroll_approver` name/description; permission label dùng resource+action sẵn có (approve/process) — không cần thêm
- [x] 4.3 a11y + dark mode badge/menu OK (RunsSheet aria-label + focus-within; badge PENDING_APPROVAL→pending amber, contrast tốt); không còn hardcode text
- [x] 4.4 web 314 + api 527 test xanh; typecheck toàn repo sạch; manual verified EN + dark (screenshot: "Pay runs"/"Pending approval"); khôi phục VI+Light

## ✅ Checkpoint C — Ship-ready → `/review`
