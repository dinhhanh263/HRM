# Feature: "Remember me" — Session vs Persistent login

## Objective
Make the existing (cosmetic) "Remember me" checkbox on the login screen functional:
ticking it keeps the user signed in across browser restarts (persistent, 7 days);
leaving it unticked makes the session end when the browser closes (session cookie,
short server-side token TTL).

## Target Users
All HRM users who sign in with email + password (`SUPER_ADMIN`, `HR_MANAGER`,
`MANAGER`, `EMPLOYEE`). Especially relevant on shared/kiosk machines where a user
does NOT want their session to persist.

## Current State (verified)
- Checkbox renders with local `rememberMe` state — purely cosmetic
  ([LoginPage.tsx:36](../../apps/web/src/features/auth/pages/LoginPage.tsx#L36),
  [:254-271](../../apps/web/src/features/auth/pages/LoginPage.tsx#L254)).
- `onSubmit` sends only `{email, password, tenantSlug}` — `rememberMe` is dropped.
- `LoginRequest` shared type has no `rememberMe` field.
- Refresh-token cookie is ALWAYS `maxAge: 7d` and DB token TTL is ALWAYS 7 days,
  regardless of user choice.

## Core Features

1. **Frontend sends the choice** — `onSubmit` includes `rememberMe` in the login
   payload; `useLogin` and the `LoginRequest` type carry it.
   - AC: ticking/unticking the box changes the request body sent to `/auth/login`.

2. **Persistent login (checked)** — refresh-token cookie is persistent
   (`maxAge: 7d`) and the DB refresh token expires in 7 days. This is today's
   behavior and remains the default.
   - AC: after login with box checked, closing & reopening the browser keeps the
     user signed in (cookie survives; `/auth/refresh` succeeds).

3. **Session login (unchecked)** — refresh-token cookie is a SESSION cookie (no
   `maxAge`/`expires`, so the browser drops it on close) and the DB refresh token
   expires in a short window (1 day).
   - AC: after login with box unchecked, the `Set-Cookie` for `refresh_token` has
     no `Max-Age`/`Expires`; DB token `expiresAt` ≈ now + 1 day.

4. **Choice survives token rotation** — `/auth/refresh` rotates the refresh token
   and re-issues the cookie. The rotated cookie must keep the SAME persistence as
   the original login (a session login stays a session cookie after refresh).
   - AC: refreshing a session login re-issues a session cookie (no Max-Age) with a
     ~1-day DB TTL; refreshing a persistent login re-issues a 7-day persistent
     cookie.

## Out of Scope
- "Remember email only" autofill behavior (a different feature; not chosen).
- Changing access-token (JWT) lifetime — stays 15m.
- Google SSO persistence choice — SSO has no checkbox; keep current 7-day
  persistent behavior. (Only note: SSO-created refresh tokens default to
  persistent.)
- Configurable TTLs via env/tenant settings.
- "Remember this device" / trusted-device management.

## Technical Approach

### Data model (Prisma migration)
Add a `persistent` flag to `RefreshToken` so token rotation can honor the original
choice (a session cookie sends no expiry back, so the server cannot otherwise know):

```prisma
model RefreshToken {
  // ...existing...
  persistent Boolean @default(true) @map("persistent")
}
```
`@default(true)` preserves the behavior of any tokens issued before the migration.

### API contract
`POST /auth/login` request body gains an optional boolean:
```ts
{ email, password, tenantSlug, rememberMe?: boolean }  // default false when absent
```
Response shape is unchanged.

### Token TTLs
| Choice | Cookie | DB token TTL |
|--------|--------|--------------|
| `rememberMe = true`  | persistent, `maxAge 7d` | 7 days |
| `rememberMe = false` | session (no maxAge)     | 1 day  |

### Layers touched
- `packages/shared/src/types/auth.ts` — add `rememberMe?: boolean` to `LoginRequest`.
- `apps/web` LoginPage — pass `rememberMe` into `login.mutate`; add to `loginSchema`.
- `apps/web` `useLogin` — type already flows via `LoginRequest`.
- `apps/api` `loginSchema` validator — add `rememberMe: z.boolean().optional().default(false)`.
- `apps/api` `auth.service.login` — accept `rememberMe`, set DB TTL, persist flag.
- `apps/api` `auth.service.createTokens` — parameterize TTL + `persistent`.
- `apps/api` `auth.service.refresh` — read stored `persistent`, carry it forward,
  return it so the controller picks the cookie type.
- `apps/api` `auth.controller.login` + `refresh` — choose persistent vs session
  cookie options based on the (returned) `persistent` flag.
- `apps/api` `refresh-token.repository.create` — accept `persistent`.

## Code Style
- Follow `.claude/rules/` (TypeScript strict, Zod validation both sides, 2-space).
- No hardcoded magic numbers — name TTL constants (`REFRESH_TOKEN_EXPIRES_DAYS`,
  new `SESSION_REFRESH_TOKEN_EXPIRES_DAYS = 1`).
- Cookie options derived from a single helper to avoid persistent/session drift.

## Testing Strategy
- **Unit** (`auth.service`): login with `rememberMe` true vs false sets the correct
  DB `expiresAt` window and `persistent` flag; refresh carries `persistent` forward.
- **Integration** (`auth.test.ts` / Supertest): `Set-Cookie` for `refresh_token`
  has `Max-Age` when remembered and lacks it when not; refresh preserves the type.
- **Frontend** (`LoginPage.test.tsx`): toggling the box changes the mutate payload;
  default (untouched) submits `rememberMe: false`.
- Coverage ≥ 80% on changed files.

## Boundaries
### Always Do
- Keep refresh-token rotation + single-use semantics intact.
- Default to **session (false)** when `rememberMe` is absent — safer default.
- `secure`/`httpOnly`/`sameSite` cookie attributes unchanged.

### Ask First
- Changing the unchecked TTL away from 1 day, or the checked TTL away from 7 days.
- Any change to access-token (JWT) lifetime.

### Never Do
- Store the raw refresh token anywhere (only sha256 hash, as today).
- Leak account/tenant existence via login error differences.
- Persist `rememberMe` choice in localStorage as a security decision (server is
  the authority via the DB `persistent` flag).
