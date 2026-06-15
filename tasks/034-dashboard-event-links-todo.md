# TODO 034 — Dashboard Upcoming Events: Clickable Links

## Task 1: Backend — employeeId + team-scope probation events
- [x] RED: unit tests `deriveUpcomingEvents` (employeeId, lifecycle options, exclude self)
- [x] RED: integration test MANAGER thấy probation_ending của report
- [x] GREEN: shared type + repository select id + service options
- [x] Tests pass (unit 36, integration 12; full API suite 1185)

## Task 2: Frontend — EventItem clickable
- [x] RED: DashboardPage tests cho navigate + permission gating
- [x] GREEN: EventItem button + navigate
- [x] Tests pass (dashboard 44)

## Task 3: Frontend — /probation?employee deep-link
- [x] RED: ProbationReviewList deep-link tests (open review → sheet; none → dialog preselected)
- [x] GREEN: useSearchParams consume + CreateReviewDialog initialEmployeeId
- [x] Tests pass (full web suite 441)

## Checkpoint: E2E verify
- [x] Full stack chạy, login manager (tung.ngo) — dashboard hiện probation event của report
- [x] Click event có review mở → scorecard sheet mở thẳng (Cao Đức Anh)
- [x] Click event chưa có review → dialog tạo mở preselected → tạo thành công (đã dọn data test)
- [x] Screenshot bằng chứng

## Review (five-axis)
- [x] Fix sau review: deep-link lookup review theo employeeId thay vì page-1 list (tránh sai khi >20 reviews)
- [x] Full suites: API 1185 pass, Web 441 pass, tsc clean cả 2 app
