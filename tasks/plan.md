# Implementation Plan: HRM Project Foundation & Auth

**Spec:** [docs/specs/001-project-init-auth.md](../docs/specs/001-project-init-auth.md)  
**Created:** 2026-05-29  
**Estimated:** 12-16 tasks, ~2-3 days

---

## Overview

This plan breaks Phase 1 into vertical slices. Each task delivers complete, testable functionality.

```
Phase 1: Infrastructure    → Monorepo, Docker, configs
Phase 2: Database          → Prisma schema, migrations, seed
Phase 3: Auth Backend      → API endpoints (vertical slices)
Phase 4: Auth Frontend     → UI + integration (vertical slices)
Phase 5: Integration       → Full flow verification
```

---

## Phase 1: Infrastructure Setup

### Task 1.1: Initialize Monorepo Structure

**Objective:** Create pnpm workspace with Turborepo

**Files to create:**
```
/package.json
/pnpm-workspace.yaml
/turbo.json
/.gitignore
/.nvmrc
/apps/web/package.json
/apps/api/package.json
/packages/shared/package.json
```

**Acceptance Criteria:**
- [ ] `pnpm install` works from root
- [ ] `pnpm --filter @hrm/web dev` starts Vite
- [ ] `pnpm --filter @hrm/api dev` starts Express
- [ ] `pnpm build` builds all packages via Turbo

**Dependencies:** None

---

### Task 1.2: Configure TypeScript & Linting

**Objective:** Strict TypeScript, ESLint, Prettier across all packages

**Files to create:**
```
/tsconfig.json (base)
/apps/web/tsconfig.json
/apps/api/tsconfig.json
/packages/shared/tsconfig.json
/.eslintrc.cjs
/.prettierrc
```

**Acceptance Criteria:**
- [ ] `pnpm lint` runs ESLint on all packages
- [ ] `pnpm format` runs Prettier
- [ ] TypeScript strict mode enabled (no implicit any)
- [ ] Path aliases work (`@/`, `@hrm/shared`)

**Dependencies:** Task 1.1

---

### Task 1.3: Docker Compose Setup

**Objective:** PostgreSQL + Redis for local development

**Files to create:**
```
/docker/docker-compose.yml
/docker/.env.example
/.env.example (root)
/apps/api/.env.example
```

**Acceptance Criteria:**
- [ ] `docker compose up -d` starts PostgreSQL 16 + Redis
- [ ] PostgreSQL accessible at localhost:5432
- [ ] Redis accessible at localhost:6379
- [ ] Data persisted in named volumes

**Dependencies:** Task 1.1

---

## Checkpoint: Infrastructure Complete

**Verify before proceeding:**
- [ ] Fresh clone + `pnpm install` works
- [ ] `docker compose up -d` starts services
- [ ] All lint checks pass
- [ ] Both apps start without errors

---

## Phase 2: Database Setup

### Task 2.1: Prisma Schema & Migrations

**Objective:** Multi-tenant schema with Tenant, User, RefreshToken

**Files to create:**
```
/apps/api/prisma/schema.prisma
/apps/api/src/infrastructure/database/client.ts
```

**Acceptance Criteria:**
- [ ] Prisma schema defines Tenant, User, RefreshToken models
- [ ] User.email unique per tenant (composite unique)
- [ ] Role enum: SUPER_ADMIN, HR_MANAGER, MANAGER, EMPLOYEE
- [ ] `pnpm --filter @hrm/api db:migrate` creates tables
- [ ] `pnpm --filter @hrm/api db:studio` opens Prisma Studio

**Dependencies:** Task 1.3

**Schema:**
```prisma
enum UserRole {
  SUPER_ADMIN
  HR_MANAGER
  MANAGER
  EMPLOYEE
}

enum UserStatus {
  ACTIVE
  INACTIVE
  PENDING
}

model Tenant {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  customDomain String?  @map("custom_domain")
  settings     Json     @default("{}")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  users        User[]
  
  @@map("tenants")
}

model User {
  id              String     @id @default(cuid())
  tenantId        String     @map("tenant_id")
  email           String
  passwordHash    String     @map("password_hash")
  fullName        String     @map("full_name")
  role            UserRole   @default(EMPLOYEE)
  status          UserStatus @default(PENDING)
  emailVerifiedAt DateTime?  @map("email_verified_at")
  lastLoginAt     DateTime?  @map("last_login_at")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")
  
  tenant          Tenant     @relation(fields: [tenantId], references: [id])
  refreshTokens   RefreshToken[]
  
  @@unique([tenantId, email])
  @@map("users")
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String    @map("user_id")
  tokenHash String    @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")
  
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([tokenHash])
  @@map("refresh_tokens")
}
```

---

### Task 2.2: Database Seed Script

**Objective:** Seed dev data: 1 tenant, 1 super admin, 1 employee

**Files to create:**
```
/apps/api/prisma/seed.ts
```

**Acceptance Criteria:**
- [ ] Creates "CodeCrush" tenant with slug "codecrush"
- [ ] Creates super_admin user: admin@codecrush.asia / Admin@123
- [ ] Creates employee user: employee@codecrush.asia / Employee@123
- [ ] `pnpm --filter @hrm/api db:seed` runs idempotently

**Dependencies:** Task 2.1

---

## Checkpoint: Database Ready

**Verify before proceeding:**
- [ ] `pnpm --filter @hrm/api db:migrate` succeeds
- [ ] `pnpm --filter @hrm/api db:seed` creates test data
- [ ] Prisma Studio shows all tables with data
- [ ] Can query users via Prisma client

---

## Phase 3: Auth Backend (Vertical Slices)

### Task 3.1: Shared Types & API Client Setup

**Objective:** Define shared types used by both frontend and backend

**Files to create:**
```
/packages/shared/src/types/auth.ts
/packages/shared/src/types/api.ts
/packages/shared/src/types/user.ts
/packages/shared/src/index.ts
```

**Types:**
```typescript
// api.ts
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// auth.ts
export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  tenantSlug: string;
}

export interface AuthResponse {
  user: UserDto;
  accessToken: string;
}

// user.ts
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string;
}
```

**Acceptance Criteria:**
- [ ] Types importable: `import { LoginRequest } from '@hrm/shared'`
- [ ] Build succeeds with shared package

**Dependencies:** Task 1.2

---

### Task 3.2: Express App Foundation

**Objective:** Express app with middleware, error handling, health check

**Files to create:**
```
/apps/api/src/app.ts
/apps/api/src/server.ts
/apps/api/src/app/middlewares/error.middleware.ts
/apps/api/src/app/middlewares/cors.middleware.ts
/apps/api/src/app/routes/index.ts
/apps/api/src/app/routes/health.routes.ts
/apps/api/src/shared/errors/AppError.ts
/apps/api/src/shared/utils/logger.ts
/apps/api/src/shared/utils/async-handler.ts
```

**Acceptance Criteria:**
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] Global error handler catches AppError
- [ ] CORS configured for localhost:5173
- [ ] Helmet.js security headers applied
- [ ] Pino logger configured

**Dependencies:** Task 2.1

---

### Task 3.3: Auth Service — Register

**Objective:** User registration with password hashing

**Files to create:**
```
/apps/api/src/domain/services/auth.service.ts
/apps/api/src/domain/repositories/user.repository.ts
/apps/api/src/domain/repositories/tenant.repository.ts
/apps/api/src/app/validators/auth.validator.ts
/apps/api/src/app/controllers/auth.controller.ts
/apps/api/src/app/routes/v1/auth.routes.ts
/apps/api/src/shared/helpers/hash.helper.ts
/apps/api/src/shared/helpers/jwt.helper.ts
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/register` creates user
- [ ] Password hashed with bcrypt (12 rounds)
- [ ] Returns user + accessToken + sets refresh cookie
- [ ] Validates: email format, password min 8 chars, tenant exists
- [ ] Returns 409 if email already exists in tenant

**Test:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test@123","fullName":"Test User","tenantSlug":"codecrush"}'
```

**Dependencies:** Task 3.2, Task 3.1

---

### Task 3.4: Auth Service — Login

**Objective:** Email/password login with JWT tokens

**Files to modify:**
```
/apps/api/src/domain/services/auth.service.ts
/apps/api/src/app/controllers/auth.controller.ts
/apps/api/src/app/validators/auth.validator.ts
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/login` authenticates user
- [ ] Verifies password with bcrypt
- [ ] Returns accessToken (15 min) + sets refresh cookie (7 days)
- [ ] Stores refresh token hash in DB
- [ ] Updates user.lastLoginAt
- [ ] Returns 401 for invalid credentials

**Test:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@codecrush.asia","password":"Admin@123","tenantSlug":"codecrush"}'
```

**Dependencies:** Task 3.3

---

### Task 3.5: Auth Service — Token Refresh

**Objective:** Refresh access token using httpOnly cookie

**Files to modify:**
```
/apps/api/src/domain/services/auth.service.ts
/apps/api/src/app/controllers/auth.controller.ts
/apps/api/src/domain/repositories/refresh-token.repository.ts
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/refresh` generates new access token
- [ ] Reads refresh token from httpOnly cookie
- [ ] Validates token hash against DB
- [ ] Rotates refresh token (new token, old one revoked)
- [ ] Returns 401 if token expired or revoked

**Dependencies:** Task 3.4

---

### Task 3.6: Auth Service — Logout & Me

**Objective:** Logout (revoke token) and get current user

**Files to modify/create:**
```
/apps/api/src/domain/services/auth.service.ts
/apps/api/src/app/controllers/auth.controller.ts
/apps/api/src/app/middlewares/auth.middleware.ts
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/logout` revokes refresh token
- [ ] Clears refresh token cookie
- [ ] `GET /api/v1/auth/me` returns current user (protected)
- [ ] Auth middleware validates JWT and attaches user to req

**Dependencies:** Task 3.5

---

### Task 3.7: Auth API Integration Tests

**Objective:** Test all auth endpoints with Supertest

**Files to create:**
```
/apps/api/tests/integration/auth.test.ts
/apps/api/tests/setup.ts
/apps/api/vitest.config.ts
```

**Acceptance Criteria:**
- [ ] Test register success + duplicate email error
- [ ] Test login success + invalid credentials
- [ ] Test refresh token rotation
- [ ] Test logout clears session
- [ ] Test /me returns user when authenticated
- [ ] Coverage > 80% on auth module

**Dependencies:** Task 3.6

---

## Checkpoint: Backend Auth Complete

**Verify before proceeding:**
- [ ] All auth endpoints work via curl
- [ ] Integration tests pass
- [ ] Token refresh works correctly
- [ ] Logout revokes refresh token

---

## Phase 4: Auth Frontend (Vertical Slices)

### Task 4.1: Vite + React Foundation

**Objective:** Setup Vite with React, Tailwind, shadcn/ui

**Files to create:**
```
/apps/web/index.html
/apps/web/src/main.tsx
/apps/web/src/App.tsx
/apps/web/src/index.css
/apps/web/tailwind.config.ts
/apps/web/postcss.config.js
/apps/web/vite.config.ts
/apps/web/components.json (shadcn)
```

**Acceptance Criteria:**
- [ ] `pnpm --filter @hrm/web dev` starts at localhost:5173
- [ ] Tailwind CSS working
- [ ] shadcn/ui initialized (`button`, `input`, `card` components)
- [ ] Path alias `@/` configured

**Dependencies:** Task 1.2

---

### Task 4.2: Auth Store & API Client

**Objective:** Zustand auth store + Axios/fetch client

**Files to create:**
```
/apps/web/src/stores/auth.store.ts
/apps/web/src/lib/api-client.ts
/apps/web/src/features/auth/api/auth.api.ts
```

**Acceptance Criteria:**
- [ ] Auth store: user, accessToken, isAuthenticated, actions
- [ ] API client with base URL config
- [ ] Auth API: login(), register(), refresh(), logout(), getMe()
- [ ] Axios interceptor attaches Authorization header
- [ ] Interceptor auto-refreshes on 401

**Dependencies:** Task 4.1, Task 3.1

---

### Task 4.3: Login Page

**Objective:** Login form with validation and error handling

**Files to create:**
```
/apps/web/src/features/auth/components/LoginForm.tsx
/apps/web/src/features/auth/pages/LoginPage.tsx
/apps/web/src/lib/validations/auth.validation.ts
```

**Acceptance Criteria:**
- [ ] Email + password + tenant slug inputs
- [ ] Client-side validation with Zod + react-hook-form
- [ ] Shows error message on invalid credentials
- [ ] Shows loading state during submission
- [ ] Redirects to `/` on success
- [ ] Link to register page

**Dependencies:** Task 4.2

---

### Task 4.4: Register Page

**Objective:** Registration form for new users

**Files to create:**
```
/apps/web/src/features/auth/components/RegisterForm.tsx
/apps/web/src/features/auth/pages/RegisterPage.tsx
```

**Acceptance Criteria:**
- [ ] Email + password + confirm password + full name + tenant slug
- [ ] Password strength indicator (optional)
- [ ] Validation: password match, min 8 chars, valid email
- [ ] Shows error if email exists
- [ ] Redirects to `/` on success
- [ ] Link to login page

**Dependencies:** Task 4.3

---

### Task 4.5: Protected Routes & Layout

**Objective:** Route protection and app shell

**Files to create:**
```
/apps/web/src/components/layout/AppLayout.tsx
/apps/web/src/components/layout/AuthLayout.tsx
/apps/web/src/components/auth/ProtectedRoute.tsx
/apps/web/src/features/dashboard/pages/DashboardPage.tsx
/apps/web/src/router.tsx
```

**Acceptance Criteria:**
- [ ] ProtectedRoute redirects to /login if not authenticated
- [ ] AuthLayout for login/register (centered card)
- [ ] AppLayout with sidebar placeholder
- [ ] Dashboard shows "Welcome, {user.fullName}"
- [ ] React Router configured

**Dependencies:** Task 4.4

---

### Task 4.6: Token Auto-Refresh

**Objective:** Refresh token before expiry, handle session expiration

**Files to modify:**
```
/apps/web/src/lib/api-client.ts
/apps/web/src/stores/auth.store.ts
```

**Acceptance Criteria:**
- [ ] Refresh token 1 minute before expiry
- [ ] Queue concurrent requests during refresh
- [ ] Redirect to login if refresh fails
- [ ] Show toast on session expiration

**Dependencies:** Task 4.5

---

## Checkpoint: Frontend Auth Complete

**Verify before proceeding:**
- [ ] Can register new user via UI
- [ ] Can login with seeded users
- [ ] Dashboard shows after login
- [ ] Refresh works (wait 15 min or shorten for testing)
- [ ] Logout clears session

---

## Phase 5: Integration & Polish

### Task 5.1: End-to-End Verification

**Objective:** Manual E2E test of complete auth flow

**Verification Steps:**
1. [ ] Start Docker: `docker compose up -d`
2. [ ] Migrate DB: `pnpm --filter @hrm/api db:migrate`
3. [ ] Seed DB: `pnpm --filter @hrm/api db:seed`
4. [ ] Start API: `pnpm --filter @hrm/api dev`
5. [ ] Start Web: `pnpm --filter @hrm/web dev`
6. [ ] Register new user at localhost:5173/register
7. [ ] Logout and login with new user
8. [ ] Verify dashboard shows user name
9. [ ] Wait for token refresh (or trigger manually)
10. [ ] Logout and verify redirect to login

**Dependencies:** All previous tasks

---

### Task 5.2: Documentation & Cleanup

**Objective:** README, API docs, cleanup

**Files to create/update:**
```
/README.md
/apps/api/README.md
/apps/web/README.md
```

**Acceptance Criteria:**
- [ ] Root README with quick start guide
- [ ] API README with endpoint documentation
- [ ] All .env.example files complete
- [ ] No console.log statements (use logger)
- [ ] No TODO comments left

**Dependencies:** Task 5.1

---

## Final Checkpoint: Phase 1 Complete

**Definition of Done:**
- [ ] All acceptance criteria from spec met
- [ ] Unit tests passing (>80% coverage on auth module)
- [ ] Integration tests passing
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] No ESLint warnings (`pnpm lint`)
- [ ] Docker Compose works from fresh clone
- [ ] Can register, login, and access protected route
- [ ] README documentation complete

---

## Task Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Infrastructure | 3 tasks | 2-3 hours |
| 2. Database | 2 tasks | 1-2 hours |
| 3. Auth Backend | 5 tasks | 4-6 hours |
| 4. Auth Frontend | 6 tasks | 4-6 hours |
| 5. Integration | 2 tasks | 1-2 hours |
| **Total** | **18 tasks** | **12-19 hours** |

---

## Next Steps

Run `/build` to start implementing tasks in order.
