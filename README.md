# HRM System

A Human Resource Management system built with React, Express, PostgreSQL, and Redis.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, TanStack Query |
| Backend | Express, TypeScript, Prisma, PostgreSQL, Redis |
| Auth | JWT (access + refresh tokens), bcrypt |
| Build | pnpm, Turborepo |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for PostgreSQL + Redis)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd hrm
pnpm install

# Start database
cd docker && docker compose up -d && cd ..

# Setup database
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed

# Start development
pnpm dev
```

### URLs

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **Health check**: http://localhost:3000/health

### Test Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@codecrush.asia | Admin@123 | Super Admin |
| employee@codecrush.asia | Employee@123 | Employee |

## Project Structure

```
hrm/
├── apps/
│   ├── web/          # React frontend (Vite)
│   └── api/          # Express backend
├── packages/
│   └── shared/       # Shared types
├── docker/           # Docker Compose
└── docs/             # Documentation
```

## Scripts

```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm db:migrate   # Run Prisma migrations
pnpm db:seed      # Seed database
pnpm db:studio    # Open Prisma Studio
```

## API Endpoints

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register new user |
| POST | /api/v1/auth/login | Login |
| POST | /api/v1/auth/refresh | Refresh access token |
| POST | /api/v1/auth/logout | Logout |
| GET | /api/v1/auth/me | Get current user |

## License

Private - CodeCrush
