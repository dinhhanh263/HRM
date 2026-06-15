# Plan: "Remember me" — Session vs Persistent login

Spec: [docs/specs/008-remember-me.md](../docs/specs/008-remember-me.md)

## Analysis

The behavior is a single feature with two branches (persistent vs session), but it
flows through two server entry points that both issue the refresh cookie:
`/auth/login` and `/auth/refresh`. The session branch needs a server-side
`persistent` flag on `RefreshToken` because a session cookie sends no expiry back,
so rotation (`/auth/refresh`) cannot otherwise know the original choice.

This gives two natural vertical slices (login path, refresh path), each verifiable
end-to-end, plus a frontend wiring slice and manual verification.

### Key files
- `packages/shared/src/types/auth.ts` — `LoginRequest`
- `apps/api/prisma/schema.prisma` — `RefreshToken` model (add `persistent`)
- `apps/api/src/domain/repositories/refresh-token.repository.ts` — `create`
- `apps/api/src/domain/services/auth.service.ts` — `createTokens`, `login`, `refresh`
- `apps/api/src/app/validators/auth.validator.ts` — `loginSchema`
- `apps/api/src/app/controllers/auth.controller.ts` — `login`, `refresh`, cookie opts
- `apps/web/src/features/auth/pages/LoginPage.tsx` — `loginSchema` + `onSubmit`
- Tests: `apps/api/tests/integration/auth.test.ts`,
  new `auth.service` unit test, `apps/web/.../LoginPage.test.tsx`

### Dependency map
```
T1 (foundation: type + migration + flag) ──► T2 (login path) ──► T3 (refresh path)
                                              └────────────────► T4 (frontend wiring)
T2,T3,T4 ──► T5 (tests + manual verify)
```

---

## Task T1 — Foundation: type, migration, cookie helper

**Objective**: Plumb `rememberMe` into the contract and add the `persistent`
column + a single cookie-options helper so login/refresh can't drift.

**Files**:
- `packages/shared/src/types/auth.ts` — add `rememberMe?: boolean` to `LoginRequest`
- `apps/api/prisma/schema.prisma` — add `persistent Boolean @default(true)`
- migration via `prisma migrate dev --name add_refresh_token_persistent`
- `apps/api/src/app/controllers/auth.controller.ts` — extract
  `refreshCookieOptions(persistent: boolean)` returning persistent vs session opts
- `apps/api/src/app/validators/auth.validator.ts` — `rememberMe: z.boolean().optional().default(false)`

**Acceptance**:
- [ ] `LoginRequest.rememberMe?: boolean` compiles across web + api
- [ ] Migration adds nullable-safe `persistent` defaulting true
- [ ] `refreshCookieOptions(true)` → has `maxAge`; `(false)` → no `maxAge`/`expires`

**Dependencies**: none

---

## Task T2 — Login path honors the choice

**Objective**: `POST /auth/login` sets DB TTL + `persistent` flag + cookie type
from `rememberMe`.

**Files**:
- `auth.service.ts` — `createTokens(user, { rememberMe })`: TTL 7d vs 1d, pass
  `persistent` to repo; `login` forwards `rememberMe`; add
  `SESSION_REFRESH_TOKEN_EXPIRES_DAYS = 1`
- `refresh-token.repository.ts` — `create` accepts `persistent`
- `auth.controller.ts` — `login` uses `refreshCookieOptions(rememberMe)`

**Acceptance**:
- [ ] `rememberMe:true` → DB `expiresAt` ≈ +7d, `persistent:true`, cookie has Max-Age
- [ ] `rememberMe:false` → DB `expiresAt` ≈ +1d, `persistent:false`, session cookie
- [ ] absent `rememberMe` → treated as false

**Dependencies**: T1

---

## Task T3 — Refresh rotation preserves the choice

**Objective**: `/auth/refresh` carries the stored `persistent` forward into the new
token + cookie.

**Files**:
- `auth.service.ts` — `refresh` reads `storedToken.persistent`, passes it to
  `createTokens`, returns `persistent` in result
- `auth.controller.ts` — `refresh` uses `refreshCookieOptions(result.persistent)`

**Acceptance**:
- [ ] refreshing a session login → new session cookie, DB TTL ≈ +1d, persistent:false
- [ ] refreshing a persistent login → new 7d persistent cookie, persistent:true

**Dependencies**: T2

---

## Task T4 — Frontend sends the choice

**Objective**: LoginPage submits `rememberMe`.

**Files**:
- `LoginPage.tsx` — add `rememberMe` to `loginSchema`/`defaultValues:false`; wire the
  checkbox to form state (or pass current `rememberMe` state into `login.mutate`);
  ensure `onSubmit` includes it

**Acceptance**:
- [ ] toggling the box changes the `/auth/login` request body
- [ ] default submit sends `rememberMe:false`

**Dependencies**: T1

---

## Checkpoint: Behavior complete
- [ ] Build passes (web + api), no TS errors
- [ ] Manual: checked → cookie has Max-Age; unchecked → session cookie (DevTools)

---

## Task T5 — Tests + manual verification

**Objective**: Lock behavior with tests at every layer; verify in browser.

**Files**:
- `apps/api/tests/unit/...` auth.service: TTL + persistent for both branches; refresh carries forward
- `apps/api/tests/integration/auth.test.ts`: Set-Cookie Max-Age present/absent; refresh preserves type
- `apps/web/.../LoginPage.test.tsx`: payload reflects toggle; default false
- Manual: login both modes, inspect Set-Cookie, screenshot

**Acceptance**:
- [ ] All new tests pass; coverage ≥ 80% on changed files
- [ ] Screenshot of login + DevTools cookie evidence captured

**Dependencies**: T2, T3, T4
