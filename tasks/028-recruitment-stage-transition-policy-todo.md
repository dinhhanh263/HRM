# TODO: SPEC-028 — Stage-transition policy (recruitment)

> Spec: `docs/specs/028-recruitment-stage-transition-policy.md`
> Mô hình 3 tầng: Invariant (terminal block) · Gate (OFFER) · Override (force + reason).

## Phase 1: Foundation — Shared + RBAC [RBAC]
- [x] 1.1 shared/rbac.ts: thêm `'application_force_move'` vào `PERMISSION_CATALOG.recruitment`
- [x] 1.2 api/rbac/catalog.ts: cấp `recruitment:application_force_move` cho HR_MANAGER (SUPER_ADMIN wildcard tự có)
- [x] 1.3 typecheck shared + api pass

### ✅ Checkpoint A — permission key mới có trong catalog, seed sync được

## Phase 2: Policy thuần + unit test (RED→GREEN)
- [x] 2.1 RED: `tests/unit/stage-transition.policy.test.ts` — ma trận terminal/gate/force/reason
- [x] 2.2 GREEN: `domain/recruitment/stage-transition.policy.ts` pure function
- [x] 2.3 unit test pass (15/15)

### ✅ Checkpoint B — policy phủ mọi nhánh, không I/O

## Phase 3: Repo signals + validator
- [x] 3.1 interview.repository.ts: `existsCompletedByApplication(applicationId)` (+ batched `applicationIdsWithCompletedInterview(jobId)` cho DTO)
- [x] 3.2 scorecard.repository.ts: `existsSubmittedByApplication(applicationId)` (+ batched `applicationIdsWithSubmittedScorecard(jobId)`)
- [x] 3.3 recruitment.validator.ts: `moveApplicationSchema` thêm `force: z.boolean().optional()`

## Phase 4: Service wiring + controller [RBAC] (RISK)
- [x] 4.1 application.service.ts `move()`: load signals + gọi policy với `actorCanForce`, `force`, `note`
- [x] 4.2 application.controller.ts `move`: resolve `actorCanForce` (SUPER_ADMIN || perm set has key), truyền xuống service
- [x] 4.3 repo `move()` ghi note vào stage history khi force (đã có cột note — đảm bảo truyền)

## Phase 5: Integration tests [RBAC]
- [x] 5.1 recruitment.application.test.ts: move OFFER chưa phỏng vấn → 409 OFFER_GATE_UNMET
- [x] 5.2 có interview COMPLETED + scorecard submitted → move OFFER 200
- [x] 5.3 move tới stage HIRED/REJECTED → 409 MOVE_TO_TERMINAL
- [x] 5.4 HR_MANAGER force + note → 200 (history có note); thiếu note → 422
- [x] 5.5 MANAGER force=true → 409 (không có quyền force)

### ✅ Checkpoint C — backend enforcement đầy đủ; toàn bộ test API pass, không regression (85 files / 1060 tests pass)

## Phase 6: DTO signal + Frontend
- [x] 6.1 shared: `ApplicationDto` thêm `offerGateMet?: boolean`
- [x] 6.2 application.service.ts `listByJob`: batched signals → set `offerGateMet` per app (tránh N+1)
- [x] 6.3 JobPipelineBoard: disable mục OFFER + tooltip khi `!offerGateMet` && !canForce
- [x] 6.4 ForceMoveDialog (clone RejectApplicationDialog) — textarea lý do bắt buộc
- [x] 6.5 useMoveApplication: truyền `force`, `note`
- [x] 6.6 i18n vi + en: tooltip cổng, dialog lý do, lỗi gate

### ✅ Checkpoint D — FE verified end-to-end qua preview (HR_MANAGER force HOANG NGUYEN HUU → Offer, note ghi vào stage history). Phát hiện & vá lỗ hổng RBAC: role_permission link `force_move` cho hr_manager chưa được sync ở các tenant hiện hữu → chạy `syncSystemRolesForTenant` cho mọi tenant + flush Redis role cache.

## Phase 7: E2E + review
- [x] 7.1 recruitment-critical-path.spec.ts: gate OFFER chặn khi chưa có PV COMPLETED + scorecard submitted (force-actor bị route qua dialog lý do, không silent move); sau khi đủ điều kiện → move thẳng vào "Đề nghị (Offer)". 2/2 E2E pass, không regression happy-path.
- [x] 7.2 `/review` five-axis — đạt. 1060/1060 API tests pass, typecheck api+web sạch, 2/2 E2E recruitment pass. Không phát hiện vấn đề Critical/Warning.

### ✅ Checkpoint E — SPEC-028 hoàn tất: policy 3 tầng (invariant/gate/override) enforce server-side + RBAC end-to-end, FE gate + force dialog, audit note vào ApplicationStageHistory, phủ unit (16) + integration (5) + E2E (2).
