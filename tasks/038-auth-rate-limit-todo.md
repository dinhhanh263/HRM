# TODO: SPEC-038 — Rate Limiting cho Auth Endpoints

> Spec: docs/specs/038-auth-rate-limiting.md
> Feature nhỏ — 1 vertical slice (middleware + wiring + env + test), TDD: viết test trước.

## Phase 1: Foundation
- [x] 1.1 Cài `express-rate-limit@^8` vào `apps/api` (pnpm workspace)
- [x] 1.2 Thêm `RATE_LIMIT_DISABLED="true"` vào `apps/api/.env.test` (+ ghi chú `.env.example` nếu có)

## Phase 2: TDD — RED
- [x] 2.1 Viết `apps/api/tests/integration/auth.rate-limit.test.ts`:
  - suite tự set `process.env.RATE_LIMIT_DISABLED = 'false'` (restore sau)
  - 5 lần login sai cùng email → không 429; lần 6 → 429 + `error.code === 'RATE_LIMITED'` + `success === false`
  - email khác cùng IP sau khi email A bị chặn → không 429
  - `RATE_LIMIT_DISABLED=true` → lần 6+ không 429
- [x] 2.2 Chạy test → FAIL (chưa có middleware)

## Phase 3: GREEN
- [x] 3.1 Tạo `apps/api/src/app/middlewares/rate-limit.middleware.ts`:
  - `authLimiter`: 5 req/15min, key = `path:ipKeyGenerator(ip):email`, skip qua env,
    handler trả 429 `{success:false, error:{code:'RATE_LIMITED', message}}`,
    `standardHeaders: 'draft-8'`, `legacyHeaders: false`
- [x] 3.2 Gắn `authLimiter` trước `validate` trong `auth.routes.ts` cho: login, register,
  forgot-password, reset-password, set-password, change-password
- [x] 3.3 Test rate-limit xanh

## Checkpoint: Core Complete

## Phase 4: Verify & Review
- [x] 4.1 `pnpm --filter @hrm/api typecheck` + lint sạch
- [x] 4.2 Chạy lại toàn bộ integration suite — suite cũ vẫn xanh (nhờ RATE_LIMIT_DISABLED trong .env.test)
- [x] 4.3 /review five-axis — fix trong review: fallback key email → token → Authorization
  cho set/reset/change-password (tránh rơi về IP-only); thêm test reset-password keyed by token
