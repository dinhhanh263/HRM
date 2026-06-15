# PLAN-007: Google Workspace SSO — Task Breakdown

**Spec:** `docs/specs/007-google-workspace-sso.md`
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Strategy:** Vertical slice, security-first, TDD. Backend testable with a mocked
`OAuth2Client` so we don't block on real Google credentials.

---

## Resolved decisions (from Discovery)

1. **Invite-only** — no JIT provisioning; only existing `ACTIVE` users may sign in.
2. **Tenant by email domain** — new `TenantDomain` table (globally-unique `domain`).
3. **`google-auth-library`** — official, lightweight; used for code-exchange + `verifyIdToken`.
4. **Reuse refresh-cookie infra** — callback sets the same `refresh_token` httpOnly
   cookie as normal login, then frontend calls `/auth/refresh`.

---

## Dependency map

```
T1 (dep + env + config) ─┐
T2 (TenantDomain schema + migration + seed) ─┐
        │                                     │
        ▼                                     ▼
T3 google.service.ts (wrap OAuth2Client) ── T4 tenantDomain repo + lookup
        │                                     │
        └──────────────┬──────────────────────┘
                       ▼
        T5 authService.loginWithGoogle(idTokenPayload) → tokens
                       │
                       ▼
        T6 controller + routes (GET /auth/google, GET /auth/google/callback)
           + state CSRF cookie  ── integration tests (mock OAuth2Client)
                       │
                       ▼
        T7 frontend: wire LoginPage button → GET /auth/google;
           /auth/google/success bounce page calls /auth/refresh;
           /login error handling; i18n vi+en
                       │
                       ▼
        T8 verify: typecheck + tests + light/dark screenshots + /review
```

---

## Tasks

### T1 — Dependency, env, config
- `pnpm --filter @hrm/api add google-auth-library` (**needs approval**).
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `GOOGLE_SUCCESS_REDIRECT` (frontend bounce URL) to env schema + `.env.example`.
- Config module reads/validates them; if unset, `/auth/google` returns a clean
  "SSO not configured" error rather than crashing boot.
- **Files:** `apps/api/src/config/*`, `apps/api/.env.example`.

### T2 — `TenantDomain` model + migration + seed
- Add model per spec (globally-unique `domain`, FK to Tenant, cascade).
- `prisma migrate dev --name add_tenant_domains`.
- Seed `codecrush.asia` → tenant `codecrush`.
- **Files:** `apps/api/prisma/schema.prisma`, new migration, `prisma/seed.ts`.

### T3 — `google.service.ts` (OAuth2Client wrapper)
- `getAuthUrl(state)` → consent URL (scope `openid email profile`).
- `verifyCode(code)` → exchange + `verifyIdToken` → `{ email, emailVerified, name }`.
- Thin wrapper so tests can `vi.mock` it. No business logic here.
- **Test:** unit test asserting `verifyCode` rejects unverified/invalid tokens.
- **Files:** `apps/api/src/domain/services/google.service.ts` (+ helper for client singleton).

### T4 — TenantDomain repository + lookup
- `findByDomain(domain)` → tenant or null (lowercased).
- **Files:** `apps/api/src/domain/repositories/tenant-domain.repository.ts`.

### T5 — `authService.loginWithGoogle({ email, name })`
- Resolve tenant by email domain (T4) → reject if none.
- `findByEmailAndTenant` → reject if no user / not `ACTIVE`.
- `updateLastLogin` + `createTokens` (reuse existing helper).
- Return `{ accessToken, refreshToken }` (controller sets cookie).
- **Test:** integration covering happy path + each rejection branch.
- **Files:** `apps/api/src/domain/services/auth.service.ts`.

### T6 — Controller + routes + state CSRF
- `GET /auth/google` → generate `state`, set short-lived httpOnly `g_state` cookie,
  302 to `googleService.getAuthUrl(state)`.
- `GET /auth/google/callback` → validate `state` vs cookie; `verifyCode`; require
  `emailVerified`; `authService.loginWithGoogle`; set `refresh_token` cookie;
  302 → `GOOGLE_SUCCESS_REDIRECT`. Any failure → 302 `/login?error=<code>`.
- **Test:** `auth.google.integration.test.ts` with mocked `googleService` — happy
  path, bad state, unverified email, unknown domain, unknown user, inactive user.
- **Files:** `apps/api/src/app/controllers/auth.controller.ts`,
  `apps/api/src/app/routes/v1/auth.routes.ts`.

### T7 — Frontend wiring
- LoginPage button → `window.location.href = '${API}/api/v1/auth/google'`
  (replace the `alert` placeholder).
- New tiny route `/auth/google/success` (or reuse existing bootstrap): on mount
  call `/auth/refresh`; on success store accessToken + navigate `/`; on fail →
  `/login?error=sso`.
- LoginPage reads `?error=` query → shows neutral toast/inline message; i18n keys.
- **Files:** `apps/web/src/features/auth/pages/LoginPage.tsx`, a small
  `GoogleCallbackPage.tsx`, `router.tsx`, `i18n/locales/{vi,en}/auth.json`.

### T8 — Verify
- `pnpm typecheck`, full test suite, browser smoke (needs real creds — otherwise
  verify the rejection/redirect paths + UI states), light + dark screenshots, `/review`.

---

## Risk notes

- **Biggest risk:** account-enumeration via distinct error messages. Mitigation:
  all rejection branches use ONE neutral message + a generic `?error` code.
- **Secret leakage:** `GOOGLE_CLIENT_SECRET` stays server-side; never logged.
- **External blocker:** real Google OAuth credentials (T8 browser smoke) — Hạnh
  provides; backend build/tests proceed with mock in the meantime.
- **`customDomain` ambiguity:** left untouched; new `TenantDomain` is the source
  of truth for SSO domain→tenant mapping.
