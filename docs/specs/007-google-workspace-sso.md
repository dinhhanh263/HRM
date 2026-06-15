# SPEC-007: Google Workspace SSO Login

**Status:** Draft
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Depends on:** SPEC-001 (Auth), SPEC-003 (RBAC), SPEC-006 (Employee Bulk Import — invite/set-password flow)

---

## Objective

Cho phép người dùng đăng nhập bằng tài khoản **Google Workspace** của công ty thay vì nhập mật khẩu. Nút "Continue with Google Workspace" trên trang Login hiện đang là placeholder (`alert('coming soon')`); spec này biến nó thành luồng đăng nhập OAuth 2.0 thật.

Google SSO **chỉ thay thế bước nhập mật khẩu** — nó không tạo tài khoản mới và không cấp quyền mới. Mọi phân quyền (role/permission), tenant-scope, và trạng thái tài khoản vẫn do hệ thống HRM quyết định như cũ.

## Target Users

| User | Hành vi |
|------|---------|
| **Nhân viên đã được mời** (User đã tồn tại trong tenant) | Bấm "Continue with Google", chọn tài khoản Google, vào thẳng hệ thống — không cần mật khẩu |
| **Người chưa được mời** (email Google không khớp User nào) | Bị từ chối với thông báo rõ ràng "liên hệ quản trị viên" — KHÔNG tự tạo tài khoản |
| **Quản trị viên** | Không có thao tác mới ở v1; chỉ cần khai báo domain cho tenant (xem Decisions) |

---

## Decisions locked in Discovery (2026-05-31)

1. **Provisioning — Invite-only.** Google SSO **không** tự tạo tài khoản. Email từ Google phải đã tồn tại như một `User` trong tenant (được tạo qua đăng ký/bulk import). Google chỉ thay bước mật khẩu. Email lạ → từ chối, hướng dẫn liên hệ admin. Đây là quyết định bảo mật cốt lõi: không cho phép bất kỳ ai có một địa chỉ Google đúng domain tự lọt vào hệ thống.

2. **Tenant resolution — theo domain email.** Mỗi tenant khai báo (các) domain của mình. Domain của email Google (`user@codecrush.asia` → `codecrush.asia`) được dùng để tìm tenant. Loại bỏ nhu cầu người dùng nhập `tenantSlug` thủ công khi đăng nhập bằng Google.

3. **Thư viện — `google-auth-library`** (chính thức của Google, gọn nhẹ). Dùng `OAuth2Client` để đổi authorization code lấy token và verify `id_token`. **Cần phê duyệt thêm dependency này** (chưa có trong stack).

4. **Kiến trúc token — tái sử dụng hạ tầng refresh sẵn có.** Sau khi verify Google thành công, backend phát hành refresh token (httpOnly cookie) y như luồng login thường, rồi redirect về frontend; frontend gọi `/auth/refresh` để lấy access token. Không phát minh cơ chế phiên mới.

---

## Out of Scope (v1)

- **Auto-provisioning / JIT account creation** — bị loại bỏ rõ ràng (xem Decision 1).
- **Kích hoạt tài khoản INVITED qua Google** — v1 chỉ cho phép user `ACTIVE` đăng nhập bằng Google. User `INVITED`/`PENDING` vẫn phải set mật khẩu qua link mời trước (quyết định: tránh mở rộng bề mặt rủi ro; có thể mở ở v2).
- **Liên kết/huỷ liên kết tài khoản Google trong trang Settings.**
- **Đăng nhập bằng Google cá nhân (gmail.com)** — chỉ chấp nhận domain đã khai báo của tenant.
- **Nhiều provider SSO** (Microsoft, Okta…) — kiến trúc nên để ngỏ nhưng không build.

---

## Tenant Resolution by Domain

### Vấn đề với `customDomain` hiện có

`Tenant.customDomain String? @map("custom_domain")` đã tồn tại nhưng:
- Là **single** domain, nullable, ngữ nghĩa mơ hồ (có thể đang dùng cho mục đích khác như custom URL).
- Một tenant thực tế có thể có **nhiều** domain (vd `codecrush.asia` + `codecrush.com`).
- Không có ràng buộc unique → hai tenant có thể vô tình khai cùng domain.

### Đề xuất: bảng `TenantDomain` riêng

```prisma
model TenantDomain {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  domain    String   @unique          // "codecrush.asia" — lowercased, không có @
  createdAt DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("tenant_domains")
}
```

- `domain` **unique toàn cục** → một domain chỉ thuộc đúng một tenant (chặn chiếm domain chéo).
- Hỗ trợ nhiều domain / tenant.
- `customDomain` cũ giữ nguyên (không đụng) để tránh phá vỡ thứ khác; nếu sau này xác nhận nó vô dụng sẽ dọn ở task riêng.
- **Seed:** thêm `codecrush.asia` cho tenant `codecrush` trong seed để dev/test chạy được ngay.

> Lookup: `email.split('@')[1].toLowerCase()` → `tenantDomainRepository.findByDomain(domain)` → `tenant`. Không tìm thấy domain → từ chối ("tổ chức chưa được cấu hình cho Google SSO").

---

## OAuth 2.0 Flow (Authorization Code)

```
[Frontend Login]                [API]                         [Google]
      │                           │                              │
  click "Continue                 │                              │
   with Google"                   │                              │
      │ ── GET /auth/google ─────▶│                              │
      │                           │ build consent URL            │
      │◀── 302 redirect ──────────│  (client_id, redirect_uri,   │
      │                           │   scope=openid email profile,│
      │                           │   state=<csrf>)              │
      │ ─────────────────────────────────────── redirect ──────▶│
      │                           │                         user chọn
      │                           │                         tài khoản
      │◀──── 302 callback?code=…&state=… ───────────────────────│
      │ ── GET /auth/google/      │                              │
      │      callback?code=… ────▶│                              │
      │                           │ ── exchange code ───────────▶│
      │                           │◀── id_token (email, email_   │
      │                           │     verified, name, hd) ─────│
      │                           │ verify id_token signature    │
      │                           │ + check email_verified       │
      │                           │ resolve tenant by domain     │
      │                           │ find ACTIVE user by          │
      │                           │   (email, tenantId)          │
      │                           │ issue refresh token (cookie) │
      │◀── 302 → /auth/google/    │                              │
      │     success ──────────────│ (Set-Cookie: refresh_token)  │
      │ ── POST /auth/refresh ───▶│ (đọc cookie)                 │
      │◀── { accessToken, user } ─│                              │
   lưu accessToken,               │                              │
   điều hướng vào app             │                              │
```

### Vì sao redirect-based (không phải Google Identity Services popup + ID token)?

- Tái dùng đúng hạ tầng refresh-cookie hiện có; không cần JS SDK của Google ở frontend.
- `state` chống CSRF; `redirect_uri` cố định, đăng ký sẵn ở Google Console → an toàn.
- Đơn giản để test bằng integration test ở backend (mock `OAuth2Client`).

---

## Security Requirements

1. **`state` CSRF token** — sinh ngẫu nhiên ở `GET /auth/google`, lưu tạm (httpOnly cookie ngắn hạn, vd 10 phút), đối chiếu ở callback. Không khớp → từ chối.
2. **Verify `id_token`** bằng `OAuth2Client.verifyIdToken({ idToken, audience: CLIENT_ID })` — xác thực chữ ký Google, `aud`, `exp`. Không tự giải mã JWT thủ công.
3. **Bắt buộc `email_verified === true`** từ Google — chặn email giả mạo.
4. **Invite-only** — chỉ user `status === ACTIVE` tồn tại trong tenant mới qua được. Mọi nhánh thất bại (domain lạ / email không có user / user không ACTIVE) đều redirect về `/login?error=<code>` với **thông báo trung lập, không tiết lộ** user/tenant nào tồn tại.
5. **Secrets qua ENV** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Không hardcode, không log. `GOOGLE_CLIENT_SECRET` không bao giờ ra khỏi backend.
6. **Không log PII/secret** — chỉ log event (`auth.google.success`, `auth.google.rejected` + lý do dạng code), không log email/token.
7. **Refresh token** — phát hành y hệt login thường (hash lưu DB, cookie httpOnly + SameSite + Secure ở prod).

---

## External Blocker (cần Hạnh thực hiện)

Phải tạo **OAuth 2.0 Client ID** trong Google Cloud Console:
1. Tạo project (hoặc dùng project sẵn có) → APIs & Services → Credentials.
2. Configure OAuth consent screen (Internal nếu Workspace org, hoặc External).
3. Create Credentials → OAuth client ID → Web application.
4. Authorized redirect URI: `http://localhost:5173/api/v1/auth/google/callback` (dev — đi qua Vite proxy để cookie refresh nằm đúng origin của SPA) + URL prod sau này.
5. Cung cấp 3 giá trị vào `apps/api/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
   ```

> Có thể build & test backend bằng **mock `OAuth2Client`** mà chưa cần credential thật; nhưng smoke test end-to-end trên trình duyệt cần credential thật.

---

## Acceptance Criteria

- [ ] User ACTIVE có email khớp domain tenant đăng nhập được bằng Google, không nhập mật khẩu, vào đúng tenant với đúng role/permission.
- [ ] Email Google không khớp user nào → redirect `/login` với thông báo trung lập, KHÔNG tạo user.
- [ ] Domain email không thuộc tenant nào → từ chối tương tự.
- [ ] User `INVITED`/`PENDING`/khác `ACTIVE` → từ chối (chưa kích hoạt).
- [ ] `state` không khớp / thiếu → từ chối (CSRF).
- [ ] `email_verified=false` từ Google → từ chối.
- [ ] Không có secret/PII nào bị log.
- [ ] `GET /auth/google` và `/auth/google/callback` có integration test (mock OAuth2Client) phủ các nhánh trên.
- [ ] Nút trên LoginPage hoạt động thật; i18n vi+en; verify light + dark bằng screenshot.
- [ ] Typecheck sạch; toàn bộ test pass.

---

## Open Questions (không chặn v1)

- Khi user vừa có mật khẩu vừa có Google — hiện cả hai đều dùng được; OK.
- Có nên cho INVITED user kích hoạt qua Google (thay link set-password)? → để v2.
- Logout có cần revoke phía Google không? → v1 chỉ revoke phiên HRM (đủ).
