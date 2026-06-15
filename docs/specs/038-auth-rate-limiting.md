# SPEC-038: Rate Limiting cho Auth Endpoints

## Objective

Chặn brute-force/credential-stuffing trên các endpoint xác thực bằng `express-rate-limit`,
hiện thực hoá yêu cầu đã có sẵn trong `.claude/rules/security.md` (authLimiter 5 req/15min)
nhưng chưa được implement ở bất kỳ đâu trong `apps/api`.

## Target Users

Không có UI — đây là hardening tầng API. Ảnh hưởng mọi client gọi `/api/v1/auth/*`.

## Core Features

### 1. Middleware `rate-limit.middleware.ts`
- File: `apps/api/src/app/middlewares/rate-limit.middleware.ts`.
- Dùng `express-rate-limit@^8` (peer `express >= 4.11`, tương thích Express 4.22.2 đang dùng).
- `authLimiter`: **5 requests / 15 phút**, đếm mọi request (kể cả thành công — chuẩn bảo mật,
  tránh attacker "nháp" 4 lần rồi reset bằng 1 lần đúng).
- **Key = `path + IP + email`** (email lowercase từ `req.body.email`, fallback IP-only nếu
  body không có email). Lý do: văn phòng chung IP (NAT) không bị khoá oan khi 1 người gõ sai;
  path nằm trong key để mỗi endpoint có bucket riêng dù dùng chung 1 limiter instance.
- IP lấy qua helper `ipKeyGenerator` của thư viện (xử lý IPv6 subnet đúng cách — tránh
  validation error của v8 khi tự nối `req.ip`).
- `standardHeaders: 'draft-8'`, `legacyHeaders: false`.
- **Acceptance**: request thứ 6 trong 15 phút cùng (path, IP, email) → 429; email khác cùng
  IP vẫn đi qua bình thường.

### 2. Response 429 chuẩn dự án
- Handler trả đúng error shape của `error.middleware.ts`:
  ```json
  { "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many attempts, please try again later" } }
  ```
- **Acceptance**: integration test assert đủ `success === false` và `error.code === 'RATE_LIMITED'`.

### 3. Áp lên các route nhạy cảm trong `auth.routes.ts`
- `POST /login`, `/register`, `/forgot-password`, `/reset-password`, `/set-password`,
  `/change-password` — limiter đặt **trước** `validate(...)` để request body sai vẫn bị đếm.
- KHÔNG áp lên: `/refresh`, `/logout`, `/me`, `/google`, `/google/callback` (không nhận
  credential dạng đoán được; refresh chạy nền mỗi 15 phút từ client hợp lệ).

### 4. Tắt được trong môi trường test
- `skip: () => process.env.RATE_LIMIT_DISABLED === 'true'` — đọc env **mỗi request** nên
  test có thể bật/tắt động trong cùng process.
- `.env.test` thêm `RATE_LIMIT_DISABLED="true"` → toàn bộ integration suite cũ (auth.test.ts
  có > 5 lần login) không bị 429.
- Test rate-limit tự set `process.env.RATE_LIMIT_DISABLED = 'false'` trong suite của nó.

## Out of Scope

- `apiLimiter` 100 req/15min cho toàn bộ `/api` (rule có nhắc nhưng task này chỉ làm auth;
  ghi nhận làm sau).
- Redis store (`rate-limit-redis`) cho multi-instance — hiện API chạy single instance,
  MemoryStore đủ; nâng cấp khi scale ngang.
- `trust proxy` config cho production sau reverse proxy — chưa có proxy trong stack hiện tại.
- UI hiển thị lockout/countdown phía web.

## Technical Approach

- Dependency mới: `express-rate-limit@^8.5.2` (MIT, native TS types, 0 deps).
- Một instance `authLimiter` export từ middleware, dùng chung cho 6 route (bucket tách theo
  path trong key).
- Không đụng `app.ts` — gắn per-route trong `auth.routes.ts`.

## Testing Strategy

- Integration (`tests/integration/auth.rate-limit.test.ts`, supertest):
  1. 5 lần login sai cùng email → đều 401; lần 6 → **429** + đúng error shape.
  2. Sau khi email A bị chặn, email B cùng IP → **không** 429 (chứng minh key IP+email).
  3. `RATE_LIMIT_DISABLED=true` → lần 6+ không bị 429.
- Regression: toàn bộ suite integration cũ xanh với `.env.test` mới.

## Boundaries

### Always Do
- Limiter đứng trước `validate` trong middleware chain.
- Error shape đúng chuẩn `{success:false, error:{code, message}}`.

### Never Do
- Không khoá theo IP đơn thuần (văn phòng chung IP).
- Không log email/credential trong limiter.
- Không commit (user làm việc local).

*Created: 2026-06-12 | SPEC-038*
