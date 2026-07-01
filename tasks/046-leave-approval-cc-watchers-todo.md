# TODO — SPEC-046: Leave Approval CC / Watchers

## Slice 1: Cấu hình CC trong Flow (foundation)
- [x] 1.1 Prisma: model `ApprovalWatcher` + relations (`ApprovalFlow.watchers`, `Employee.watchingFlows`)
- [x] 1.2 Migration additive (`prisma migrate dev`)
- [x] 1.3 Shared types: `ApprovalWatcherDto`, `WatcherInput`, `watchers` trong Flow DTO
- [x] 1.4 Validator: `watcherSchema` + gắn vào create/update flow (+ `replaceWatchersSchema`)
- [x] 1.5 Repository + service: include + CRUD watchers trong transaction
- [x] 1.6 Controller/route: flow CRUD truyền watchers (+ optional `PUT /flows/:id/watchers`)
- [x] 1.7 Frontend form: section "CC / Người theo dõi" (role dropdown + employee picker)
- [x] 1.8 i18n vi/en `flows.form.watchers.*`
- [x] 1.9 Tests: validator unit + `POST/PATCH/GET /flows` integration

## Checkpoint 1: watcher config end-to-end OK

## Slice 2: Quyền xem read-only cho watcher
- [x] 2.1 `isWatcher()` helper + unit test (role/specific/none)
- [x] 2.2 Repo `findWatchedCandidates()`
- [x] 2.3 Service: scope `watching` + flag readOnly
- [x] 2.4 Controller: `getRequest` cho phép watcher; `listRequests` scope `watching`
- [x] 2.5 Frontend: tab "Đang theo dõi" + badge "CC · chỉ xem" + ẩn action + banner detail
- [x] 2.6 i18n vi/en (scope/badge/banner)
- [x] 2.7 Tests: watcher list+detail 200; non-watcher 403; **watcher approve → 403**; owner/approver bất biến

## Checkpoint 2: read-only visibility + bất biến "không duyệt được"

## Slice 3: Notification cho watcher
- [x] 3.1 Resolve watcher-users (SPECIFIC_USER→userId; ROLE→findByRoleKey)
- [x] 3.2 Emit notification on submit (best-effort, dedupe, bỏ owner-trùng)
- [x] 3.3 Emit notification on APPROVED/REJECTED
- [x] 3.4 web: mapping kind mới nếu cần
- [x] 3.5 Tests: unit dedupe/resolve; integration submit + decided

## Checkpoint 3: notification submit + decision OK

## Slice 4: E2E + review
- [x] 4.1 E2E critical path (cấu hình CC → nộp → HR thấy + notification → duyệt → notification kết quả)
- [x] 4.2 /review five-axis + a11y + dark mode + i18n đủ
- [ ] 4.3 Commit + PR (khi được yêu cầu)
