# TODO: "Remember me" — Session vs Persistent

## Phase 1: Foundation
- [x] T1: shared `LoginRequest.rememberMe`, `RefreshToken.persistent` migration, `loginSchema`, `refreshCookieOptions` helper

## Phase 2: Backend behavior
- [x] T2: login path sets TTL (7d/1d) + persistent flag + cookie type from rememberMe
- [x] T3: refresh rotation preserves persistent (cookie type + TTL)

## Phase 3: Frontend
- [x] T4: LoginPage submits rememberMe (default false)

## Checkpoint: Behavior complete
- [x] Build passes (web + api); cookie behavior covered by integration tests

## Phase 4: Verify
- [x] T5: integration (35 pass) + frontend (23 pass) tests; login page renders + checkbox toggles (verified in preview)

## Phase 5: Fix "remember me" not restoring on reopen
- [x] T6: auth.store boots in loading state (no dev mock) so ProtectedRoute waits for silent refresh instead of redirecting
- [x] T7: AuthInitializer boot refresh goes through shared refreshAccessToken() mutex — StrictMode double-invoke no longer fires 2 refreshes that self-revoke the single-use token (287 web tests pass; verified in browser: login + remember me → reload stays on dashboard)
