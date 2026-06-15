# HRM System — Project Guide

> **Dành cho Claude Code:** Đây là tài liệu tham chiếu duy nhất khi xây dựng bất kỳ page/component nào trong hệ thống HRM. Mọi quyết định về UI, màu sắc, spacing, component đều phải follow file này.

---

## Project Overview

Hệ thống HRM (Human Resource Management) xây dựng cho CodeCrush sử dụng nội bộ trước, sau đó productize bán cho các công ty khác dưới dạng SaaS. Hệ thống quản lý nhân viên, chấm công, nghỉ phép và lương.

**Design philosophy:** Premium SaaS feel — như Linear, Vercel, Notion. Tối giản nhưng polished. Không màu mè nhưng có chiều sâu. Mọi pixel đều có mục đích.

---

## Development Workflow

```
/spec → /plan → /build → /test → /review → Ship
Define   Plan    Build   Verify  Review   Deploy
```

| Phase | Command | Purpose |
|-------|---------|---------|
| **Define** | `/spec` | PRD với objectives, scope, boundaries |
| **Plan** | `/plan` | Decompose thành vertical slices |
| **Build** | `/build` | TDD: RED → GREEN → REFACTOR |
| **Verify** | `/test` | Write & verify tests |
| **Review** | `/review` | Five-axis review trước merge |
| **Ship** | `/deploy` | Build, test, deploy staged |

**Core Principles:** Test-first · Incremental · Fix root causes · Simplest thing that works

---

## Tech Stack

### Frontend
| Layer | Choice |
|-------|--------|
| Framework | React 18 + TypeScript 5 (strict) |
| Build | Vite (admin SPA) / Next.js 14 App Router (marketing) |
| Styling | Tailwind CSS v3 + CSS Variables |
| Components | shadcn/ui + Radix UI |
| Icons | Lucide React (stroke-width: 1.5) |
| Font | Inter via Google Fonts |
| State | Zustand (global) + TanStack Query v5 (server) |
| Forms | React Hook Form + Zod |
| i18n | react-i18next (vi + en) |
| Animation | tailwindcss-animate + Framer Motion (sparingly) |
| Toast | Sonner |
| Date | date-fns |
| Table | TanStack Table v8 |
| Charts | Recharts |

### Backend
| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 LTS + TypeScript 5 |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache | Redis (ioredis) |
| Queue | BullMQ |
| Auth | JWT (access 15m + refresh 7d) + bcrypt 12 rounds |
| Logging | Pino (structured JSON) |
| Validation | Zod |

### Testing
| Type | Tool |
|------|------|
| Unit + Integration | Vitest + Testing Library |
| E2E | Playwright |
| API | Supertest |
| Coverage | ≥ 80% |

---

## 🎨 Design System

### Triết lý thiết kế 2025–2026

Dựa trên nghiên cứu từ Linear, Vercel (Geist), Notion, và các enterprise SaaS hàng đầu:

1. **Monochromatic depth** — Dùng opacity/tint của một màu, không dùng nhiều màu cùng lúc
2. **High information density** — Compact rows, small font in tables, tận dụng màn hình
3. **Borderless-first in dark mode** — Dùng background contrast thay vì border
4. **Motion has meaning** — Animation chỉ khi có purpose, không decoration
5. **Keyboard-first** — Mọi action chính đều có keyboard shortcut
6. **Skeleton over spinner** — Loading state dùng skeleton, không dùng spinner giữa trang
7. **Progressive disclosure** — Ẩn complexity sau drawer/sheet, không modal chồng modal

---

### Color Tokens

#### Kiến trúc theme — Tailwind CSS v4 (CSS-first)

> ⚠️ **KHÔNG có `tailwind.config.ts` cho màu.** Toàn bộ token sống trong `apps/web/src/index.css` qua block `@theme` của Tailwind v4, đặt tên `--color-*`, giá trị **hex** (không phải HSL). Token tự sinh class: `--color-text-muted` → `text-text-muted`, `--color-surface-alt` → `bg-surface-alt`...

**3 cơ chế switching độc lập (đều gắn trên `<html>`):**

| Thứ | Cơ chế | Giá trị |
|-----|--------|---------|
| Theme màu | attribute `data-theme` | `ocean` (default, khai báo trong `@theme`) · `sage` (override qua `[data-theme="sage"]`) |
| Sáng/Tối | class `.dark` | light (default) · dark (`.dark` override surface tokens) |
| Ngôn ngữ | attribute `lang` + i18next | `vi` (default) · `en` |

**File `apps/web/src/index.css` — chép nguyên văn:**

```css
@import 'tailwindcss';

/* App toggle dark mode bằng class `.dark` trên <html> (useThemeStore),
   nên phải bind variant `dark:` vào class thay vì prefers-color-scheme
   mặc định của Tailwind v4. Thiếu dòng này → mọi `dark:` chỉ ăn theo OS. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Ocean Blue Theme (default) */
  --color-primary: #4A9EBF;
  --color-primary-light: #E8F4F8;
  --color-primary-dark: #2E7A96;
  --color-primary-hover: #3D8DAD;
  --color-primary-foreground: #FFFFFF;

  /* Swatch xem trước theme trong PreferencesMenu (cố định, không đổi theo theme) */
  --color-swatch-ocean: #4A9EBF;
  --color-swatch-sage: #5BA68A;

  /* Ô logo brand — cố định màu tối để logo trắng đọc được ở mọi theme/mode */
  --color-brand: #0F1117;

  /* Semantic Colors */
  --color-success: #22C55E;
  --color-success-light: #DCFCE7;
  --color-warning: #F59E0B;
  --color-warning-light: #FEF3C7;
  --color-danger: #EF4444;
  --color-danger-light: #FEE2E2;
  --color-info: #3B82F6;
  --color-info-light: #DBEAFE;

  /* Light Mode Surfaces */
  --color-background: #F9FAFB;
  --color-surface: #FFFFFF;
  --color-surface-alt: #F3F4F6;
  --color-sidebar: #F1F3F5;
  --color-border: #E5E7EB;
  --color-border-strong: #D1D5DB;
  --color-text-primary: #111827;
  --color-text-secondary: #6B7280;
  --color-text-muted: #9CA3AF;

  /* Font */
  --font-family-sans: 'Inter', system-ui, sans-serif;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-text-primary font-sans antialiased;
  }
}

/* Dark mode — override surface tokens qua class .dark */
.dark {
  /* Sơn native form controls (spinner, date picker, scrollbar, autofill)
     theo UA scheme tối cho khớp surface tokens. */
  color-scheme: dark;
  --color-background: #0F1117;
  --color-surface: #1A1D27;
  --color-surface-alt: #1F2335;
  --color-sidebar: #161921;
  --color-border: #2D3048;
  --color-border-strong: #3D4166;
  --color-text-primary: #F1F5F9;
  --color-text-secondary: #94A3B8;
  --color-text-muted: #64748B;
}

/* Sage Green Theme — chỉ override nhóm primary */
[data-theme="sage"] {
  --color-primary: #5BA68A;
  --color-primary-light: #E8F5F0;
  --color-primary-dark: #3D8A6E;
  --color-primary-hover: #4E9279;
}

/* Mobile: sidebar ẩn, main content full width */
@media (max-width: 767px) {
  #main-content {
    margin-left: 0 !important;
    width: 100% !important;
  }
}

/* A11y: tôn trọng reduced-motion (WCAG 2.2) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

#### State: `useThemeStore` (Zustand + persist)

File `apps/web/src/stores/theme.store.ts`. Persist vào localStorage key **`hrm-theme`** (chú ý: dấu gạch ngang, không phải `hrm_theme`). Giữ cả 3 preference: theme màu, mode sáng/tối, ngôn ngữ.

```ts
type Theme = 'ocean' | 'sage';
type Mode = 'light' | 'dark';
type Language = 'vi' | 'en';

interface ThemeState {
  theme: Theme;        // default: 'ocean'
  mode: Mode;          // default: 'light'
  language: Language;  // default: 'vi'
  // SPEC-036: true khi user TỰ chọn ngôn ngữ — tenant default không ghi đè nữa
  languageExplicit: boolean;
  setTheme: (theme: Theme) => void;     // setAttribute('data-theme', theme)
  setMode: (mode: Mode) => void;        // classList.toggle('dark', mode === 'dark')
  toggleMode: () => void;
  setLanguage: (language: Language) => void; // đặt <html lang> + i18n.changeLanguage + languageExplicit=true
  applyTenantDefaultLanguage: (language: Language) => void; // chỉ áp khi user CHƯA tự chọn
}

// Bắt buộc: onRehydrateStorage phải apply lại cả 3 thứ lên <html>
// (data-theme, class .dark, lang) — nếu không F5 sẽ mất theme.
```

- `AppLayout` gọi `applyTenantDefaultLanguage(publicSettings.regional.defaultLanguage)` trong `useEffect` (SPEC-036: ngôn ngữ mặc định của tenant chỉ áp cho user chưa tự chọn).
- `src/i18n/index.ts` đọc `localStorage('hrm-theme').state.language` **trước khi** init i18next để tránh flash sai ngôn ngữ; fallback `'vi'`; set `document.documentElement.lang` ngay khi init.

#### Semantic / Status Colors (cố định, không đổi theo theme)
```
Success:  #22C55E  — light bg: #DCFCE7   (token: success / success-light)
Warning:  #F59E0B  — light bg: #FEF3C7   (token: warning / warning-light)
Danger:   #EF4444  — light bg: #FEE2E2   (token: danger / danger-light)
Info:     #3B82F6  — light bg: #DBEAFE   (token: info / info-light)
```

---

### Typography

**Font:** Inter — Google Fonts. Weight: 400, 500, 600, 700.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-feature-settings: 'cv11', 'ss01'; /* Inter optical sizing */
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

#### Type Scale
| Class | Size | Weight | Line Height | Letter Spacing | Dùng cho |
|-------|------|--------|-------------|----------------|----------|
| `text-xs` | 11px | 400 | 1.5 | +0.01em | Captions, hints, timestamps |
| `text-sm` | 13px | 400/500 | 1.5 | 0 | Body, table cells, labels |
| `text-base` | 15px | 400/500 | 1.6 | 0 | Default prose |
| `text-lg` | 17px | 600 | 1.4 | -0.01em | Section headings |
| `text-xl` | 20px | 600 | 1.3 | -0.02em | Page sub-headers |
| `text-2xl` | 24px | 700 | 1.2 | -0.03em | Page titles |
| `text-3xl` | 30px | 700 | 1.15 | -0.04em | Dashboard headlines |

> **Rule:** Tailwind custom fontSize config phải dùng `[size, { lineHeight, letterSpacing }]` để đảm bảo consistency tuyệt đối.

---

### Spacing System

Dùng **4px base grid**. Luôn dùng Tailwind spacing tokens:

| Token | px | Dùng cho |
|-------|-----|----------|
| `space-1` | 4px | Icon padding, tiny gaps |
| `space-2` | 8px | Compact element spacing |
| `space-3` | 12px | Between inline items |
| `space-4` | 16px | Default gap giữa elements |
| `space-5` | 20px | Card padding nhỏ |
| `space-6` | 24px | Section padding, card padding |
| `space-8` | 32px | Giữa các sections |
| `space-12` | 48px | Page-level spacing |
| `space-16` | 64px | Lớn nhất trong page |

> **Không dùng giá trị arbitrary** như `p-[18px]` trừ khi có lý do đặc biệt có comment giải thích.

---

### Border Radius

```
--radius-sm:  4px   — Badges, chips, tags nhỏ
--radius:     6px   — Inputs, selects, checkboxes
--radius-md:  8px   — Buttons, dropdown items
--radius-lg:  10px  — Cards, panels, popovers
--radius-xl:  14px  — Modals, sheets, dialogs
--radius-2xl: 20px  — Large surface containers
--radius-full: 9999px — Pills, avatar rings, toggle
```

---

### Shadows

```css
/* Light mode */
--shadow-xs:  0 1px 2px rgba(0,0,0,.04);
--shadow-sm:  0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
--shadow:     0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05);
--shadow-md:  0 10px 15px -3px rgba(0,0,0,.07), 0 4px 6px -4px rgba(0,0,0,.04);
--shadow-lg:  0 20px 25px -5px rgba(0,0,0,.08), 0 8px 10px -6px rgba(0,0,0,.04);

/* Dark mode — dùng glow thay shadow */
--shadow-xs:  0 1px 2px rgba(0,0,0,.4);
--shadow-sm:  0 1px 3px rgba(0,0,0,.5);
--shadow:     0 4px 12px rgba(0,0,0,.4);
--shadow-md:  0 8px 24px rgba(0,0,0,.45);
--shadow-lg:  0 16px 40px rgba(0,0,0,.5);
```

---

## 📐 Layout System

> **Source of truth:** `apps/web/src/components/layout/` — `AppLayout.tsx`, `Sidebar.tsx`, `PreferencesMenu.tsx`, `CommandPalette.tsx`. Spec dưới đây mô tả **đúng 100% code hiện tại** — dựng lại theo spec này phải ra đúng UI đang chạy.

### App Shell

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar fixed left (desktop ≥768px)                     │
│  · mở rộng w-60 (240px) ↔ thu gọn w-[72px]               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Logo h-14 (56px, border-b)                         │ │
│  │─────────────────────────────────────────────────────│ │
│  │  Nav groups (flex-1, overflow-y-auto, py-4 px-3)    │ │
│  │  · TỔNG QUAN      → Dashboard                       │ │
│  │  · QUẢN LÝ NHÂN SỰ→ Nhân viên · Phòng ban · Chức vụ │ │
│  │                     Tuyển dụng · Ứng viên · PV của tôi│ │
│  │  · VẬN HÀNH       → Chấm công · Nghỉ phép · Số dư phép│ │
│  │                     Thử việc · Tự đánh giá · Lương   │ │
│  │                     Tài sản                          │ │
│  │  · HỆ THỐNG       → Vai trò & quyền · Cài đặt chấm công│ │
│  │                     Loại tài sản · Cài đặt           │ │
│  │─────────────────────────────────────────────────────│ │
│  │  User profile card (border-t, p-3)                  │ │
│  │─────────────────────────────────────────────────────│ │
│  │  Nút "Thu gọn" ‹ (desktop only, border-t, p-2)      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  #main-content (offset bằng margin theo sidebar)         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Header h-14 (sticky top-0 z-20, glass)             │ │
│  │  [☰ mobile] Breadcrumb ··· 🔍Tìm kiếm ⌘K · ⚙Prefs · │ │
│  │  🔔 Notification · Avatar+Tên ▾                      │ │
│  │─────────────────────────────────────────────────────│ │
│  │  <main class="flex-1 p-6 bg-background"> <Outlet/>  │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Responsive & state:**
- **Desktop (`md:` ≥768px):** sidebar `fixed left-0 top-0 bottom-0 z-30`, 2 trạng thái **240px (`w-60`) ↔ 72px (`w-[72px]`)** — KHÔNG phải 56px. Main content trượt theo: `md:ml-60 md:w-[calc(100%-240px)]` ↔ `md:ml-[72px] md:w-[calc(100%-72px)]`, kèm `transition-[margin,width] duration-200 motion-reduce:transition-none`.
- **Mobile (<768px):** sidebar desktop ẩn (`hidden md:flex`); thay bằng **drawer** trượt từ trái (`z-50`, `transition-transform`, `-translate-x-full` khi đóng) + overlay `fixed inset-0 z-40 bg-text-primary/50 backdrop-blur-sm`. Drawer **tự đóng khi đổi route** (`useEffect` theo `location.pathname`).
- Trạng thái collapse lưu trong `useUIStore` (Zustand + persist, localStorage key **`hrm-ui`**, field `sidebarCollapsed: boolean`).
- Main content có `id="main-content"` (CSS mobile trong `index.css` reset margin/width).

### Sidebar — spec đầy đủ (`Sidebar.tsx`)

Một component, hai variant:

```tsx
interface SidebarProps {
  variant: 'desktop' | 'mobile';
  collapsed?: boolean;        // desktop only
  onToggleCollapse?: () => void;
  open?: boolean;             // mobile only
  onClose?: () => void;
}
// Mobile drawer LUÔN expanded; chỉ desktop được collapse:
const isCollapsed = variant === 'desktop' && collapsed;
```

**Container:**
```tsx
// desktop
'hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col bg-sidebar border-r border-border',
'transition-[width] duration-200 motion-reduce:transition-none',
isCollapsed ? 'w-[72px]' : 'w-60'
// mobile
'md:hidden fixed left-0 top-0 bottom-0 z-50 w-60 flex flex-col bg-sidebar border-r border-border',
'transition-transform duration-200 motion-reduce:transition-none',
open ? 'translate-x-0' : '-translate-x-full'
// Bọc toàn bộ trong <TooltipProvider delayDuration={0}>
```

**Khối 1 — Logo (56px):**
```tsx
<div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
  <Link to="/" className="flex items-center gap-3 overflow-hidden" onClick={onClose}>
    <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center shrink-0">
      <img src={logoUrl} alt="" aria-hidden="true" className="w-6 h-6" />  {/* @/assets/logo.svg */}
    </div>
    {!isCollapsed && (
      <span className="text-base font-semibold text-text-primary whitespace-nowrap">
        {t('appName')}   {/* "HRM System" */}
      </span>
    )}
  </Link>
  {/* variant === 'mobile': thêm Button ghost h-9 w-9 icon <X size={20}/> aria-label=t('sidebar.closeMenu') */}
</div>
```

**Khối 2 — Nav (`<nav className="flex-1 overflow-y-auto py-4 px-3">`):**

Mỗi group: cách nhau `mt-6`; tiêu đề group (chỉ khi expanded):
```tsx
<p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
```
Khi collapsed: thay tiêu đề bằng divider `<div className="mx-2 mb-2 h-px bg-border" />` (từ group thứ 2 trở đi). Items bọc trong `<div className="space-y-1">`.

**Nav item (Link của react-router):**
```tsx
<Link
  to={item.href}
  onClick={onClose}
  aria-current={active ? 'page' : undefined}
  className={cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    isCollapsed && 'justify-center px-2',
    active
      ? 'bg-primary-light text-primary'
      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
  )}
>
  <item.icon size={18} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
  {!isCollapsed && <span>{t(item.labelKey)}</span>}
</Link>
// Khi collapsed: bọc trong <Tooltip><TooltipTrigger asChild>…<TooltipContent side="right" sideOffset={8}>label
```

**Active-route matching (chống 2 item cùng sáng):** chọn href khớp **dài nhất** trong các href thỏa `currentPath === href || (href !== '/' && currentPath.startsWith(href + '/'))` — để `/leave` và `/leave/balances` không cùng active.

**RBAC filtering:** mỗi item gắn 1 `PermissionKey` (từ `@hrm/shared`); filter qua `usePermission().can()`; group rỗng sau filter thì **ẩn cả group**. Item `probationSelf` thêm điều kiện `requiresProbationContract` — chỉ hiện khi `user.employee.contractType === 'PROBATION'` (SPEC-033).

**Menu map (nguồn chuẩn — đủ 18 items, icon Lucide):**

| Group (key → vi) | labelKey | vi / en | Icon | Route | Permission |
|---|---|---|---|---|---|
| `groups.overview` → Tổng quan | `items.dashboard` | Dashboard / Dashboard | `LayoutDashboard` | `/` | `dashboard:view` |
| `groups.hr` → Quản lý nhân sự | `items.employees` | Nhân viên / Employees | `Users` | `/employees` | `employees:view` |
| | `items.departments` | Phòng ban / Departments | `Building2` | `/departments` | `departments:view` |
| | `items.positions` | Chức vụ / Positions | `Briefcase` | `/positions` | `positions:view` |
| | `items.recruitment` | Tuyển dụng / Recruitment | `UserSearch` | `/recruitment` | `recruitment:job_view` |
| | `items.candidates` | Ứng viên / Candidates | `Users` | `/recruitment/candidates` | `recruitment:candidate_view` |
| | `items.myInterviews` | PV của tôi / My interviews | `CalendarClock` | `/recruitment/my-interviews` | `recruitment:scorecard_submit` |
| `groups.operations` → Vận hành | `items.timesheet` | Chấm công / Timesheet | `Clock` | `/timesheet` | `timesheet:view` |
| | `items.leave` | Nghỉ phép / Leave | `CalendarOff` | `/leave` | `leave:view` |
| | `items.leaveBalances` | Số dư phép / Leave balances | `ClipboardList` | `/leave/balances` | `leave:approve` |
| | `items.probation` | Thử việc / Probation | `ClipboardCheck` | `/probation` | `probation:view` |
| | `items.probationSelf` | Tự đánh giá / My evaluation | `UserCheck` | `/probation/me` | `probation:self` + đang có HĐ thử việc |
| | `items.payroll` | Lương / Payroll | `Banknote` | `/payroll` | `payroll:view` |
| | `items.assets` | Tài sản / Assets | `Package` | `/assets` | `assets:view` |
| `groups.system` → Hệ thống | `items.roles` | Vai trò & quyền / Roles & permissions | `ShieldCheck` | `/settings/roles` | `roles:view` |
| | `items.timesheetSettings` | Cài đặt chấm công / Timesheet settings | `CalendarCog` | `/settings/timesheet` | `timesheet:view` |
| | `items.assetSettings` | Loại tài sản / Asset categories | `Boxes` | `/settings/assets` | `assets:view` |
| | `items.settings` | Cài đặt / Settings | `Settings` | `/settings` | `settings:view` |

**Khối 3 — User profile (`border-t border-border p-3`):**
- Expanded: card `flex items-center gap-3 rounded-lg bg-surface p-3` chứa `Avatar h-9 w-9` (fallback initials, `bg-primary-light text-primary text-sm font-medium`) + tên (`text-sm font-medium text-text-primary truncate`) + role (`text-xs text-text-muted truncate`).
- Collapsed: chỉ Avatar căn giữa, bọc Tooltip (side right) hiện tên + role.
- Initials: 2 ký tự đầu của các từ trong fullName, uppercase; fallback `'U'`.

**Khối 4 — Collapse toggle (desktop only, `border-t border-border p-2`):**
```tsx
<Button variant="ghost" size="sm" onClick={onToggleCollapse}
  aria-label={isCollapsed ? t('sidebar.expandAria') : t('sidebar.collapseAria')}
  className={cn('w-full h-9 flex items-center gap-2 rounded-lg transition-colors duration-100',
    'text-text-muted hover:text-text-primary hover:bg-surface',
    isCollapsed ? 'justify-center' : 'justify-start px-3')}>
  {isCollapsed
    ? <ChevronRight size={18} strokeWidth={1.5} />
    : <><ChevronLeft size={18} strokeWidth={1.5} /><span className="text-sm">{t('sidebar.collapse')}</span></>}
</Button>
```

### Header Specs (`AppLayout.tsx`)

```tsx
<header className="sticky top-0 z-20 h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur-md">
  {/* TRÁI: nút ☰ mobile (Button ghost h-9 w-9, md:hidden, mở drawer)
            + breadcrumb: Link "Trang chủ" (t('header.home'), text-text-muted hover:text-text-primary)
            → nếu currentPath !== '/': <ChevronRight size={14}/> + page title (text-text-primary font-medium) */}
  {/* PHẢI (flex items-center gap-1):
      1. Search trigger (≥sm): button h-9 px-3 rounded-md border border-border bg-surface-alt/60
         icon Search 15 + t('commandPalette.trigger') ("Tìm kiếm nhanh") + <kbd>⌘K</kbd>
         → mở CommandPalette. Mobile: chỉ icon button.
      2. <PreferencesMenu /> — ngôn ngữ + chủ đề màu + sáng/tối (spec dưới)
      3. <NotificationBell /> — chuông + badge số chưa đọc
      4. User menu: Button ghost gồm Avatar h-7 w-7 + tên cuối (hidden sm:inline)
         → DropdownMenu w-56: fullName+email · Hồ sơ cá nhân (/account) ·
           Cài đặt tài khoản (/account?tab=security) · Đăng xuất (text-danger) */}
</header>
```

Page title lấy từ map route→`titles.*` trong namespace `nav` (fallback: match 2 segment đầu của path, rồi `appName`).

### Preferences Menu — Ngôn ngữ + Chủ đề màu + Sáng/Tối (`PreferencesMenu.tsx`)

Trigger: `Button ghost h-9 w-9` icon `SlidersHorizontal size={18}`, `aria-label=t('header.preferences')`. Nội dung: `DropdownMenuContent align="end" className="w-60 p-1.5"` gồm **3 section** ngăn cách bằng `DropdownMenuSeparator`, mỗi section có label:
```tsx
<DropdownMenuLabel className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
```

| Section | Label (icon + i18n) | Options | Hiển thị option |
|---|---|---|---|
| Ngôn ngữ | `Globe size={13}` + `preferences.language` | `vi` "Tiếng Việt" · `en` "English" | badge chữ `VI`/`EN` (`size-5 rounded bg-surface-alt text-[10px] font-semibold`) |
| Chủ đề màu | `Palette size={13}` + `preferences.themeColor` | `ocean` "Ocean Blue" · `sage` "Sage Green" | chấm tròn `size-4 rounded-full ring-1 ring-inset ring-black/10` màu `bg-swatch-ocean`/`bg-swatch-sage` |
| Giao diện | `preferences.appearance` (không icon) | `light` (icon `Sun`) · `dark` (icon `Moon`), label `preferences.light`/`preferences.dark` | icon 15px |

Mỗi option là `OptionRow` — button `role="menuitemradio" aria-checked`:
```tsx
'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-100',
'outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
active ? 'bg-primary/10 text-primary font-medium'
       : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary'
// + <Check size={15}/> bên phải (opacity-0 khi không active)
```
Chọn option gọi thẳng `setLanguage` / `setTheme` / `setMode` của `useThemeStore` — apply tức thì, không cần confirm.

### i18n namespace `nav` — bắt buộc đủ các key sau (vi / en)

```jsonc
{
  "appName": "HRM System",
  "groups":  { "overview": "Tổng quan|Overview", "hr": "Quản lý nhân sự|Human Resources",
               "operations": "Vận hành|Operations", "system": "Hệ thống|System" },
  "items":   { /* 18 key — xem cột labelKey + vi/en trong Menu map ở trên */ },
  "titles":  { /* page title cho breadcrumb: dashboard, employees ("Quản lý nhân viên|Employee Management"),
                  employeeNew, departments, positions, recruitment, candidates, timesheet, leave,
                  leaveBalances ("Số dư phép toàn công ty|Company-wide leave balances"),
                  probation ("Đánh giá thử việc|Probation Review"), payroll, assets,
                  timesheetSettings, assetSettings, settings */ },
  "sidebar": { "collapse": "Thu gọn|Collapse", "expandAria": "Mở rộng thanh bên|Expand sidebar",
               "collapseAria": "Thu gọn thanh bên|Collapse sidebar", "closeMenu": "Đóng menu|Close menu" },
  "header":  { "home": "Trang chủ|Home", "openMenu": "Mở menu|Open menu",
               "notifications": "Thông báo|Notifications", "preferences": "Tùy chọn hiển thị|Display preferences" },
  "userMenu": { "profile": "Hồ sơ cá nhân|Profile", "account": "Cài đặt tài khoản|Account settings",
                "logout": "Đăng xuất|Sign out" },
  "preferences": { "language": "Ngôn ngữ|Language", "themeColor": "Chủ đề màu|Theme color",
                   "appearance": "Giao diện|Appearance", "light": "Sáng|Light", "dark": "Tối|Dark" },
  "commandPalette": { "title": "Bảng lệnh|Command palette", "placeholder": "Tìm trang hoặc hành động...|Search pages or actions...",
                      "empty": "Không có kết quả|No results", "trigger": "Tìm kiếm nhanh|Quick search",
                      "groups": { "actions": "Hành động|Actions", "navigation": "Điều hướng|Navigation" } }
}
// File thật: apps/web/src/i18n/locales/{vi,en}/nav.json (cú pháp "vi|en" ở trên chỉ là viết gọn trong doc)
```

### Page Layout Template
```tsx
// Mọi page đều follow pattern này
<div className="p-6 space-y-6 max-w-screen-xl">

  {/* Page Header */}
  <div className="flex items-start justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
      <p className="text-sm text-muted-foreground mt-1">Mô tả ngắn</p>
    </div>
    <div className="flex items-center gap-2">
      {/* Primary action button */}
    </div>
  </div>

  {/* Content sections */}
  <div className="space-y-4">
    {/* ... */}
  </div>
</div>
```

---

## 🧩 Component Library

> **Rule:** Luôn dùng shadcn/ui component làm base. Customize qua className và CSS variables, **không** override bằng `!important` hoặc inline style.

### Buttons

#### Variants & Usage

| Variant | Tailwind classes | Khi dùng |
|---------|-----------------|----------|
| `default` (Primary) | `bg-primary text-primary-foreground hover:bg-primary/90` | CTA chính: Tạo mới, Lưu, Xác nhận |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | Action thứ cấp: Lọc, Xuất, Làm mới |
| `outline` | `border border-input hover:bg-accent hover:text-accent-foreground` | Cancel, Trở về, Neutral actions |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90` | Xóa, Thu hồi, Chấm dứt |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | Icon buttons, toolbar actions |
| `link` | `text-primary underline-offset-4 hover:underline` | Navigation links trong text |

#### Sizes
| Size | Height | Padding | Font | Dùng cho |
|------|--------|---------|------|----------|
| `sm` | 32px | `px-3` | `text-xs` | Compact UI, inline actions, table rows |
| `default` | 36px | `px-4` | `text-sm` | Standard — dùng mặc định |
| `lg` | 40px | `px-6` | `text-sm` | CTA nổi bật, form submit |
| `icon` | 36px | `p-2` | — | Icon-only buttons |

#### Button States (bắt buộc có đủ)
```tsx
// ✅ Đúng — đủ states
<Button
  onClick={handleSave}
  disabled={isLoading || !isDirty}
>
  {isLoading ? (
    <><Spinner className="mr-2 h-4 w-4" />Đang lưu...</>
  ) : (
    <><Save className="mr-2 h-4 w-4" />Lưu thay đổi</>
  )}
</Button>

// ❌ Sai — thiếu loading state
<Button onClick={handleSave}>Lưu</Button>
```

#### Button Groups (cho toolbar)
```tsx
<div className="flex items-center gap-1">
  <Button variant="outline" size="sm">
    <Filter size={14} className="mr-1.5" />Lọc
  </Button>
  <Button variant="outline" size="sm">
    <Download size={14} className="mr-1.5" />Xuất Excel
  </Button>
  <Separator orientation="vertical" className="h-6" />
  <Button size="sm">
    <Plus size={14} className="mr-1.5" />Thêm nhân viên
  </Button>
</div>
```

---

### Status Badges

Dùng `<Badge>` của shadcn/ui với custom className:

```tsx
const statusConfig = {
  active:      { label: 'Hoạt động',   class: 'bg-green-50  text-green-700  border-green-200  dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
  inactive:    { label: 'Tạm nghỉ',    class: 'bg-red-50    text-red-700    border-red-200    dark:bg-red-950  dark:text-red-300  dark:border-red-800' },
  pending:     { label: 'Chờ duyệt',   class: 'bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  approved:    { label: 'Đã duyệt',    class: 'bg-green-50  text-green-700  border-green-200  dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
  rejected:    { label: 'Từ chối',     class: 'bg-red-50    text-red-700    border-red-200    dark:bg-red-950  dark:text-red-300  dark:border-red-800' },
  terminated:  { label: 'Đã nghỉ',     class: 'bg-gray-100  text-gray-600   border-gray-200   dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700' },
  on_leave:    { label: 'Đang nghỉ',   class: 'bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' },
  processing:  { label: 'Đang xử lý', class: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800' },
  draft:       { label: 'Nháp',        class: 'bg-gray-100  text-gray-500   border-gray-200   dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700' },
  paid:        { label: 'Đã trả',      class: 'bg-green-50  text-green-700  border-green-200  dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
} as const;

// Usage
<Badge variant="outline" className={`text-xs font-medium ${statusConfig[status].class}`}>
  {statusConfig[status].label}
</Badge>
```

---

### Form Inputs

```tsx
// Input với Label (dùng shadcn Field pattern)
<div className="space-y-1.5">
  <Label htmlFor="email" className="text-sm font-medium">
    Email <span className="text-destructive">*</span>
  </Label>
  <Input
    id="email"
    type="email"
    placeholder="name@company.com"
    className="h-9 text-sm"
    {...register('email')}
  />
  {errors.email && (
    <p className="text-xs text-destructive flex items-center gap-1">
      <AlertCircle size={11} />
      {errors.email.message}
    </p>
  )}
</div>
```

#### Input Specs
```
Height:         36px (h-9) — default; 32px (h-8) cho compact forms
Border:         1px solid var(--border)
Border radius:  6px (rounded-md)
Focus ring:     ring-2 ring-primary/20 border-primary
Placeholder:    text-muted-foreground
Font size:      text-sm (13px)
Padding:        px-3
```

#### Input Variants
```tsx
// Input với icon trái
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
  <Input className="pl-9 h-9" placeholder="Tìm kiếm..." />
</div>

// Input với addon phải (suffix)
<div className="flex">
  <Input className="rounded-r-none h-9" placeholder="0" />
  <span className="flex items-center px-3 border border-l-0 rounded-r-md
    bg-muted text-muted-foreground text-sm">
    ngày/năm
  </span>
</div>
```

---

### Cards

```tsx
// Standard card
<Card className="border-border">
  <CardHeader className="pb-3">
    <CardTitle className="text-base font-semibold">Tiêu đề</CardTitle>
    <CardDescription>Mô tả phụ</CardDescription>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
  <CardFooter className="pt-3 border-t border-border">
    {/* actions */}
  </CardFooter>
</Card>

// Stat card (dùng cho Dashboard metrics)
<Card className="border-border">
  <CardContent className="p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tổng nhân viên
        </p>
        <p className="text-2xl font-bold mt-1 tracking-tight">142</p>
        <p className="text-xs text-muted-foreground mt-1">
          <span className="text-green-600 font-medium">+3</span> so với tháng trước
        </p>
      </div>
      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Users size={18} className="text-primary" />
      </div>
    </div>
  </CardContent>
</Card>
```

---

### Data Table

Đây là component phức tạp nhất trong hệ thống. Follow pattern sau:

```tsx
// Table container
<div className="rounded-lg border border-border overflow-hidden">

  {/* Toolbar */}
  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 w-64 text-xs" placeholder="Tìm kiếm..." />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Filter size={12} />Lọc
            {activeFilters > 0 && (
              <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                {activeFilters}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        {/* Filter options */}
      </DropdownMenu>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
        <Download size={12} />Xuất
      </Button>
      <Button size="sm" className="h-8 text-xs gap-1.5">
        <Plus size={12} />Thêm mới
      </Button>
    </div>
  </div>

  {/* Table */}
  <Table>
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead className="w-10">
          <Checkbox />
        </TableHead>
        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tên nhân viên
        </TableHead>
        {/* more headers */}
        <TableHead className="w-16" />  {/* Actions column */}
      </TableRow>
    </TableHeader>
    <TableBody>
      {/* Rows */}
      <TableRow className="group h-12 hover:bg-muted/30">
        {/* cells */}
        <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Row actions — hiện khi hover */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  {/* Footer / Pagination */}
  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
    <p className="text-xs text-muted-foreground">
      Hiển thị 1–20 trong tổng số <span className="font-medium text-foreground">142</span>
    </p>
    <Pagination />
  </div>
</div>
```

#### Bulk Action Bar (hiện khi có rows được chọn)
```tsx
{selectedRows.length > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
    flex items-center gap-3 px-5 py-3 rounded-xl
    bg-foreground text-background shadow-lg shadow-black/20
    border border-border/10 animate-in slide-in-from-bottom-4">
    <span className="text-sm font-medium">
      {selectedRows.length} mục đã chọn
    </span>
    <Separator orientation="vertical" className="h-5 bg-background/20" />
    <Button variant="ghost" size="sm" className="h-7 text-background hover:bg-white/10">
      <Mail size={13} className="mr-1.5" />Gửi email
    </Button>
    <Button variant="ghost" size="sm" className="h-7 text-background hover:bg-white/10">
      <Download size={13} className="mr-1.5" />Xuất
    </Button>
    <Button variant="ghost" size="sm"
      className="h-7 text-red-400 hover:bg-red-500/20">
      <Trash2 size={13} className="mr-1.5" />Xóa
    </Button>
    <button onClick={() => setSelectedRows([])}
      className="ml-1 text-background/60 hover:text-background transition-colors">
      <X size={14} />
    </button>
  </div>
)}
```

---

### Modals & Sheets

```tsx
// ❌ Không dùng Dialog cho edit forms — quá nặng
// ✅ Dùng Sheet (drawer từ phải) cho edit forms
<Sheet>
  <SheetContent className="w-[480px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>Chỉnh sửa nhân viên</SheetTitle>
      <SheetDescription>Cập nhật thông tin nhân viên</SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-4">
      {/* Form fields */}
    </div>
    <SheetFooter className="mt-6">
      <SheetClose asChild>
        <Button variant="outline">Hủy</Button>
      </SheetClose>
      <Button>Lưu thay đổi</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>

// ✅ Dùng AlertDialog cho confirm actions (xóa, terminate)
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Xác nhận xóa?</AlertDialogTitle>
      <AlertDialogDescription>
        Hành động này không thể hoàn tác. Nhân viên sẽ bị xóa vĩnh viễn.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Hủy</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
        Xóa
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### Toast Notifications (Sonner)

```tsx
// Setup trong main.tsx
import { Toaster } from 'sonner';
<Toaster position="bottom-right" richColors expand={false} />

// Sử dụng
import { toast } from 'sonner';

toast.success('Lưu thành công', {
  description: 'Thông tin nhân viên đã được cập nhật.'
});

toast.error('Có lỗi xảy ra', {
  description: 'Vui lòng thử lại sau.'
});

toast.loading('Đang xử lý...');
toast.promise(saveEmployee(data), {
  loading: 'Đang lưu...',
  success: 'Lưu thành công!',
  error: 'Lưu thất bại. Thử lại sau.'
});
```

---

### Loading States

```tsx
// ✅ Skeleton loading — LUÔN dùng cho initial data load
<div className="space-y-3">
  {Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="flex items-center gap-4 p-4">
      <Skeleton className="size-9 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3.5 w-1/3 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  ))}
</div>

// ✅ Inline spinner — chỉ dùng trong button
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {isLoading ? 'Đang lưu...' : 'Lưu'}
</Button>

// ❌ KHÔNG dùng spinner full-page
```

---

### Empty States

```tsx
// Mọi danh sách trống đều phải có empty state với CTA
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
    <Users size={24} className="text-muted-foreground" />
  </div>
  <h3 className="font-semibold text-foreground mb-1">Chưa có nhân viên</h3>
  <p className="text-sm text-muted-foreground max-w-xs mb-4">
    Thêm nhân viên đầu tiên để bắt đầu quản lý nhân sự
  </p>
  <Button size="sm">
    <Plus size={14} className="mr-1.5" />Thêm nhân viên
  </Button>
</div>
```

---

### Avatars & User Display

```tsx
// Single avatar
<Avatar className="size-8">
  <AvatarImage src={user.avatar} alt={user.name} />
  <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
    {getInitials(user.name)} {/* "NV" → "Nguyễn Văn" */}
  </AvatarFallback>
</Avatar>

// User cell trong table
<div className="flex items-center gap-3">
  <Avatar className="size-8">
    <AvatarImage src={employee.avatar} />
    <AvatarFallback className="text-xs bg-primary/10 text-primary">
      {getInitials(employee.name)}
    </AvatarFallback>
  </Avatar>
  <div>
    <p className="text-sm font-medium leading-none">{employee.name}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{employee.email}</p>
  </div>
</div>
```

---

### Command Palette (⌘K)

```tsx
// Bắt buộc có trong hệ thống — keyboard-first
import { CommandDialog, CommandInput, CommandList,
  CommandGroup, CommandItem } from '@/components/ui/command';

// Trigger: Ctrl/Cmd + K
useEffect(() => {
  const down = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setOpen(true);
    }
  };
  document.addEventListener('keydown', down);
  return () => document.removeEventListener('keydown', down);
}, []);
```

---

## 🔄 Micro-interactions & Animation

### Transition Presets (dùng nhất quán)
```tsx
// Hover state changes
className="transition-colors duration-100"   // color, bg changes

// Position/size changes (subtle lift)
className="transition-all duration-150"      // button hover lift

// Appear/disappear (modals, dropdowns)
className="transition-all duration-200"      // panel animations

// Page transitions
className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
```

### Hover Lift Effect (buttons, cards)
```tsx
// Card hover
<Card className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">

// Button hover (đã built vào shadcn default)
// KHÔNG thêm transform vào buttons — gây layout shift
```

### Staggered List Animation
```tsx
// Dùng cho danh sách thẻ card — KHÔNG dùng cho table rows
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-in fade-in-0 slide-in-from-bottom-2"
    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
  >
    <Card>{/* ... */}</Card>
  </div>
))}
```

---

## 🌐 i18n Convention

```tsx
// File structure (thực tế trong repo)
apps/web/src/i18n/
  index.ts          // init i18next: đọc language từ localStorage('hrm-theme') TRƯỚC khi init,
                    // fallbackLng 'vi', defaultNS 'common', set <html lang>
  locales/
    vi/
      common.json   // Lưu, Hủy, Xóa, Tìm kiếm, Thêm mới...
      nav.json      // sidebar/header/preferences/commandPalette (xem Layout System)
      dashboard.json · auth.json · employee.json · department.json · position.json
      permission.json · role.json · leave.json · timesheet.json · payroll.json
      employeeImport.json · contracts.json · notifications.json · asset.json
      assetImport.json · recruitment.json · probation.json · settings.json · account.json
    en/
      (same — mọi key phải có đủ ở CẢ HAI ngôn ngữ)

// Key naming: namespace.section.key — dùng useTranslation('<namespace>')
const { t } = useTranslation('nav');
t('groups.hr')                     // "Quản lý nhân sự"
t('employee.form.full_name')       // "Họ và tên"
t('common.actions.save')           // "Lưu"
t('leave.status.pending')          // "Chờ duyệt"

// Đổi ngôn ngữ: KHÔNG gọi i18n.changeLanguage trực tiếp trong component —
// luôn qua useThemeStore.setLanguage() để persist + set <html lang> + đánh dấu languageExplicit (SPEC-036)

// Date formatting (luôn dùng date-fns với locale)
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

format(date, 'dd/MM/yyyy', { locale: vi })          // "29/05/2026"
format(date, "EEEE, dd 'tháng' MM yyyy", { locale: vi }) // "Thứ Sáu, 29 tháng 05 2026"
```

---

## 👥 User Roles & Permissions

| Role | Key | Access |
|------|-----|--------|
| Super Admin | `SUPER_ADMIN` | Full system + tenant config |
| HR Manager | `HR_MANAGER` | All HR operations + reports |
| Manager | `MANAGER` | Team: approve leave, view timesheet |
| Employee | `EMPLOYEE` | Own profile, leave requests, timesheet |

```tsx
// usePermission hook — dùng để ẩn/hiện UI elements
const { can } = usePermission();

// ✅ Ẩn element nếu không có quyền
{can('employee:create') && <Button>Thêm nhân viên</Button>}

// ❌ KHÔNG redirect silently — hiện 403 page thay thế
```

---

## 📋 MVP Modules & Routes

### Module map
| Module | Route | Status |
|--------|-------|--------|
| Dashboard | `/` | ✅ |
| Nhân viên | `/employees` (`/employees/new`, `/employees/:id`) | ✅ |
| Phòng ban | `/departments` | ✅ |
| Chức vụ | `/positions` | ✅ |
| Tuyển dụng | `/recruitment` · `/recruitment/candidates` · `/recruitment/my-interviews` | ✅ |
| Chấm công | `/timesheet` | ✅ |
| Nghỉ phép | `/leave` · `/leave/balances` | ✅ |
| Thử việc | `/probation` · `/probation/me` (self-eval, chỉ HĐ PROBATION) | ✅ |
| Lương | `/payroll` | ✅ |
| Tài sản | `/assets` | ✅ |
| Vai trò & quyền | `/settings/roles` | ✅ |
| Cài đặt chấm công | `/settings/timesheet` | ✅ |
| Loại tài sản | `/settings/assets` | ✅ |
| Cài đặt | `/settings` | ✅ |
| Tài khoản cá nhân | `/account` (`?tab=security`) | ✅ |

### Employee Management
- Danh sách: search, filter (dept, status, role), sort, pagination
- Profile page: tabs (Thông tin, Hợp đồng, Lịch sử, Tài liệu)
- Actions: Thêm · Sửa · Vô hiệu · Nghỉ việc
- Fields: Họ tên, Mã NV, Ngày sinh, Giới tính, CCCD, Phone, Email, Phòng ban, Vị trí, Ngày vào làm, Loại HĐ, Lương, Avatar

### Timesheet
- Check-in/out (manual + location note)
- Monthly calendar view + list view
- OT tracking với approval
- Manager view: team summary table

### Leave Management
- Đăng ký nghỉ: loại, ngày, lý do, file đính kèm
- Số ngày phép còn lại theo năm
- Approval flow: NV → Quản lý → HR
- Leave types: Năm, Ốm, Việc riêng, Không lương, Thai sản

### Payroll
- Monthly payroll run với review step
- Components: Lương cơ bản, Phụ cấp, OT, BHXH, Thuế TNCN
- Payslip PDF export
- Payroll history với filter theo tháng

---

## 🗂 File Structure

```
src/
├── assets/              # Static: images, SVG illustrations
├── components/
│   ├── ui/              # shadcn/ui (generated — không sửa trực tiếp)
│   └── shared/          # Shared custom: DataTable, PageHeader, StatusBadge...
├── features/
│   ├── employees/
│   │   ├── components/  # EmployeeTable, EmployeeForm, EmployeeCard
│   │   ├── hooks/       # useEmployees, useEmployee, useCreateEmployee
│   │   ├── api.ts       # TanStack Query hooks wrapping API calls
│   │   ├── schema.ts    # Zod schemas
│   │   └── types.ts     # TypeScript interfaces
│   ├── timesheet/
│   ├── leave/
│   └── payroll/
├── hooks/               # Shared: usePermission, useDebounce, usePagination
├── layouts/             # AppLayout, AuthLayout
├── lib/
│   ├── api.ts           # Axios instance + interceptors
│   ├── utils.ts         # cn(), getInitials(), formatCurrency()...
│   └── constants.ts     # APP_NAME, ROUTES, etc.
├── locales/             # i18n
├── pages/               # Route components (thin — import from features/)
├── stores/              # Zustand: useAuthStore, useUIStore
├── styles/
│   ├── globals.css      # CSS variables, Tailwind directives
│   └── themes.css       # Theme + dark mode CSS vars
└── types/               # Global TS types
```

---

## ⚙️ Coding Conventions

### TypeScript
```ts
// ✅ Interface cho objects, type cho unions/primitives
interface Employee {
  id: string;
  name: string;
  status: EmployeeStatus;
}
type EmployeeStatus = 'active' | 'inactive' | 'terminated';

// ✅ Luôn type return value cho async functions
async function getEmployee(id: string): Promise<Employee> {}

// ❌ Không dùng any
const data: any = response; // ← sai
```

### Component Pattern
```tsx
// ✅ Props interface explicit
interface EmployeeCardProps {
  employee: Employee;
  onEdit?: (id: string) => void;
  className?: string;
}

export function EmployeeCard({ employee, onEdit, className }: EmployeeCardProps) {
  return (
    <Card className={cn('transition-all', className)}>
      {/* ... */}
    </Card>
  );
}
```

### cn() helper (bắt buộc dùng)
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn('base-classes', condition && 'conditional-class', className)} />
```

### API Calls
```ts
// TanStack Query — không gọi fetch trực tiếp trong component
export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => employeeApi.list(params),
    staleTime: 30_000,
  });
}

// Mutations với optimistic updates
export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: employeeApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Cập nhật thành công');
    },
    onError: () => toast.error('Có lỗi xảy ra'),
  });
}
```

### Formatting
- 2 spaces indent
- Single quotes
- Semicolons: có
- Max line: 100 chars
- Prettier config committed vào repo

---

## 🚫 Anti-patterns (KHÔNG được làm)

```tsx
// ❌ Inline styles
<div style={{ marginTop: '16px' }} />

// ❌ Hardcoded colors
<div className="bg-[#4A9EBF]" />  // dùng bg-primary thay thế

// ❌ Important override
<div className="!text-red-500" />  // fix gốc thay vì override

// ❌ Spinner full page
if (loading) return <div className="flex justify-center"><Spinner /></div>
// ✅ Thay bằng skeleton

// ❌ Modal cho edit forms
<Dialog>  // ← dùng Sheet thay thế
  <EmployeeEditForm />
</Dialog>

// ❌ Gọi API trong component
const res = await fetch('/api/employees');  // ← dùng TanStack Query

// ❌ Unused imports
import { useState, useEffect, useCallback, useMemo } from 'react'; // ← chỉ import dùng

// ❌ Hardcoded Vietnamese text không qua i18n
<p>Nhân viên</p>  // ← dùng t('common.employee')
```

---

## 🔒 Security Rules

- JWT access token: 15m · Refresh: 7d
- Tất cả API calls đều qua axios interceptor — tự động attach + refresh token
- Input validation: Zod ở cả client (React Hook Form) và server
- Role check phải thực hiện ở **server side** — client UI hiding chỉ là UX
- Không log sensitive data: passwords, tokens, PII

---

## 📐 Design Checklist (trước khi commit)

- [ ] Đúng màu sắc: dùng CSS variables, không hardcode
- [ ] Responsive: hoạt động trên 768px–1440px
- [ ] Dark mode: test cả light và dark
- [ ] Loading state: skeleton khi fetch, spinner trong button
- [ ] Empty state: có illustration + CTA khi danh sách rỗng
- [ ] Error state: hiện toast hoặc inline error
- [ ] Accessibility: icon-only buttons có `aria-label`, inputs có `label`
- [ ] Keyboard: buttons/links navigate được bằng Tab
- [ ] i18n: không có hardcoded text, dùng translation keys
- [ ] Spacing: dùng Tailwind tokens, không arbitrary values

---

*Last updated: 2026-06-12 (đồng bộ Design System + Layout System + Sidebar/Preferences với code thật) | Maintained by: Đinh Văn Hạnh (hanhdinh@codecrush.asia)*
