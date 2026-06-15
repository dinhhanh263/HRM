# SPEC-001: Project Initialization & Authentication System

**Status:** Draft  
**Created:** 2026-05-29  
**Author:** Claude + Hạnh

---

## Objective

Initialize the HRM full-stack project with multi-tenant architecture and comprehensive authentication system including email/password, SSO/SAML, email verification, and password reset.

## Target Users

| User | Context |
|------|---------|
| **Super Admin** | CodeCrush internal - manage all tenants |
| **Tenant Admin** | Company admin - configure SSO, manage users |
| **Employee** | End user - login, manage own profile |

---

## Phases

### Phase 1: Project Foundation (This Spec)
- [x] Project structure setup
- [x] Database schema (multi-tenant)
- [x] Basic auth (email/password)
- [x] JWT tokens (access + refresh)

### Phase 2: Auth Enhancements
- [ ] Email verification
- [ ] Forgot/reset password
- [ ] Email service integration

### Phase 3: Enterprise Auth
- [ ] SSO/SAML integration
- [ ] Tenant-level SSO config

---

## Phase 1 Scope: Foundation

### Core Features

#### 1. Project Setup
**Acceptance Criteria:**
- [ ] Monorepo structure: `apps/web` (Vite React) + `apps/api` (Express)
- [ ] Shared packages: `packages/shared` (types, utils)
- [ ] TypeScript strict mode in all packages
- [ ] ESLint + Prettier configured
- [ ] Docker Compose for PostgreSQL + Redis
- [ ] Environment variables template (`.env.example`)

#### 2. Database Schema (Multi-tenant)
**Acceptance Criteria:**
- [ ] Tenant table with subdomain/custom domain support
- [ ] User table with tenant_id foreign key
- [ ] Role & Permission tables
- [ ] Prisma migrations working
- [ ] Seed script for dev data

**Data Model:**
```
Tenant
├── id (cuid)
├── name
├── slug (unique, for subdomain)
├── custom_domain (nullable)
├── settings (jsonb)
├── created_at
└── updated_at

User
├── id (cuid)
├── tenant_id (FK)
├── email (unique per tenant)
├── password_hash
├── full_name
├── role
├── status (active/inactive/pending)
├── email_verified_at (nullable)
├── last_login_at
├── created_at
└── updated_at

RefreshToken
├── id (cuid)
├── user_id (FK)
├── token_hash
├── expires_at
├── revoked_at (nullable)
└── created_at
```

#### 3. Authentication API
**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/register` — Create account (returns tokens)
- [ ] `POST /api/v1/auth/login` — Email/password login
- [ ] `POST /api/v1/auth/refresh` — Refresh access token
- [ ] `POST /api/v1/auth/logout` — Revoke refresh token
- [ ] `GET /api/v1/auth/me` — Get current user

**Token Strategy:**
- Access token: JWT, 15 minutes, in memory (not localStorage)
- Refresh token: opaque, 7 days, httpOnly cookie
- Rotation: new refresh token on each refresh

**API Response Format:**
```typescript
// Success
{
  success: true,
  data: {
    user: { id, email, fullName, role },
    accessToken: "eyJ...",
  }
}

// Error
{
  success: false,
  error: {
    code: "INVALID_CREDENTIALS",
    message: "Email or password is incorrect"
  }
}
```

#### 4. Frontend Auth Flow
**Acceptance Criteria:**
- [ ] Login page with form validation
- [ ] Register page (tenant slug in URL or form)
- [ ] Auth context/store with token management
- [ ] Protected route wrapper
- [ ] Auto-refresh token before expiry
- [ ] Redirect to login on 401

**Pages:**
- `/login` — Login form
- `/register` — Registration form
- `/` — Redirect to dashboard (protected)

---

## Out of Scope (Phase 1)

- Email verification flow
- Password reset flow
- SSO/SAML
- Social OAuth (Google, Microsoft)
- Two-factor authentication
- Session management UI (view active sessions)
- Rate limiting (add in Phase 2)
- Audit logging

---

## Technical Approach

### Monorepo Structure
```
hrm/
├── apps/
│   ├── web/                 # Vite + React frontend
│   │   ├── src/
│   │   │   ├── features/auth/
│   │   │   ├── components/
│   │   │   ├── stores/
│   │   │   └── ...
│   │   └── package.json
│   └── api/                 # Express backend
│       ├── src/
│       │   ├── app/
│       │   ├── domain/
│       │   ├── infrastructure/
│       │   └── ...
│       └── package.json
├── packages/
│   └── shared/              # Shared types, utils, constants
│       └── package.json
├── docker/
│   └── docker-compose.yml
├── package.json             # Root workspace
├── pnpm-workspace.yaml
└── turbo.json
```

### Tech Stack (as per CLAUDE.md)

| Layer | Choice |
|-------|--------|
| Package Manager | pnpm + workspaces |
| Build | Turborepo |
| Frontend | Vite + React 18 + TypeScript |
| UI | Tailwind + shadcn/ui |
| State | Zustand + TanStack Query |
| Backend | Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache | Redis (sessions, rate limit) |
| Auth | JWT (jose library) + bcrypt |

### Security Measures

- Password hashing: bcrypt with 12 rounds
- JWT signing: RS256 (asymmetric) or HS256 with strong secret
- Refresh token: SHA-256 hash stored in DB
- CORS: strict origin whitelist
- Helmet.js for security headers
- Input validation: Zod on all endpoints

---

## Testing Strategy

### Unit Tests
- Auth service: login, register, token generation
- Token utils: sign, verify, refresh logic
- Zod validators

### Integration Tests
- Auth API endpoints (Supertest)
- Database operations (Prisma + test DB)

### E2E Tests (Phase 2)
- Login flow
- Register flow
- Token refresh

---

## Boundaries

### Always Do
- Hash passwords with bcrypt (>= 12 rounds)
- Validate all inputs with Zod
- Return consistent API response format
- Use httpOnly cookies for refresh tokens
- Log authentication events (login, logout, failed attempts)

### Ask First
- Adding new auth methods (OAuth, SAML)
- Changing token expiry times
- Adding new user roles

### Never Do
- Store passwords in plain text
- Store access tokens in localStorage
- Log sensitive data (passwords, tokens)
- Disable CORS in production
- Skip input validation

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests passing (>80% coverage on auth module)
- [ ] Integration tests passing
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Docker Compose works (`docker compose up`)
- [ ] Can register, login, and access protected route
- [ ] Code reviewed

---

## Next Steps

After approval:
1. Run `/plan` to break down into tasks
2. Implement with `/build` using TDD
3. Review with `/review` before merge

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Tenant creation | **Admin-only** — Super Admin creates tenant, then invites users |
| User roles | **4 roles:** `super_admin`, `hr_manager`, `manager`, `employee` |
| Email service | **Resend** — for verification and password reset |

---

## Approval

- [ ] Spec reviewed by stakeholder
- [ ] Ready for `/plan`
