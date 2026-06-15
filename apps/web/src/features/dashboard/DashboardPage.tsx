import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth.store';
import {
  Users,
  UserCheck,
  UserX,
  Calendar,
  FileText,
  ChevronRight,
  Plus,
  CheckCircle,
  AlertCircle,
  Building2,
  Eye,
  Wallet,
} from 'lucide-react';
import type {
  DashboardDepartmentSlice,
  DashboardEvent,
  DashboardLeaveBalance,
  DashboardPendingLeave,
  UserRole,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { useDashboard } from './hooks/useDashboard';
import { EVENT_STYLE, formatEventDate } from './event-style';
import { useEventNavigation } from './useEventNavigation';

// Bar palette drawn from theme tokens (no hex literals); cycles for >5 depts.
const DEPT_BAR_COLORS = [
  'var(--color-primary)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
];

// Role-adaptive layout: the server returns `role` with the scoped payload, and
// the dashboard renders only the widgets that matter for that role (not just
// hidden buttons). Company roles see org-wide blocks; MANAGER sees their team
// without company-only blocks; EMPLOYEE sees self-service only. See SPEC-009.
type DashboardWidget =
  | 'stats'
  | 'leaveBalance'
  | 'deptDistribution'
  | 'pendingLeave'
  | 'upcomingEvents'
  | 'footer';

const DASHBOARD_LAYOUT_BY_ROLE: Record<UserRole, DashboardWidget[]> = {
  SUPER_ADMIN: ['stats', 'deptDistribution', 'pendingLeave', 'upcomingEvents', 'footer'],
  HR_MANAGER: ['stats', 'deptDistribution', 'pendingLeave', 'upcomingEvents', 'footer'],
  PAYROLL_APPROVER: ['stats', 'upcomingEvents'],
  MANAGER: ['stats', 'pendingLeave', 'upcomingEvents'],
  EMPLOYEE: ['leaveBalance', 'pendingLeave', 'upcomingEvents'],
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string, locale: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

const STAT_TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
} as const;

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  tone: keyof typeof STAT_TONES;
  subtitle?: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary mb-2">{title}</p>
          <p className="text-3xl font-bold text-text-primary tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-text-muted mt-2">{subtitle}</p>}
        </div>
        <div
          className={cn('w-12 h-12 rounded-xl flex items-center justify-center', STAT_TONES[tone])}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm" aria-hidden="true">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-surface-alt animate-pulse" />
          <div className="h-8 w-16 rounded bg-surface-alt animate-pulse" />
          <div className="h-3 w-20 rounded bg-surface-alt animate-pulse" />
        </div>
        <div className="w-12 h-12 rounded-xl bg-surface-alt animate-pulse" />
      </div>
    </div>
  );
}

function DepartmentChart({ data }: { data: DashboardDepartmentSlice[] }) {
  const { t } = useTranslation('dashboard');

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p className="m-0">{t('deptDistribution.empty')}</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col gap-3">
      {data.map((dept, i) => (
        <div key={dept.departmentId} className="flex items-center gap-3">
          <div className="w-[100px] text-sm text-text-primary shrink-0 truncate" title={dept.name}>
            {dept.name}
          </div>
          <div className="flex-1 h-6 bg-surface-alt rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${(dept.count / maxCount) * 100}%`,
                backgroundColor: DEPT_BAR_COLORS[i % DEPT_BAR_COLORS.length],
              }}
            />
          </div>
          <div className="w-[60px] text-sm text-text-secondary text-right tabular-nums">
            {dept.count} ({Math.round((dept.count / total) * 100)}%)
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingLeaveItem({ request }: { request: DashboardPendingLeave }) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const swatch = request.leaveType.colorHex ?? undefined;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-surface-alt last:border-b-0">
      <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-semibold shrink-0">
        {getInitials(request.employeeName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-text-primary text-sm truncate">{request.employeeName}</div>
        <div className="text-sm text-text-secondary mt-0.5 flex items-center gap-1.5">
          {swatch && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: swatch }}
              aria-hidden="true"
            />
          )}
          <span>
            {request.leaveType.name} · {formatDate(request.startDate, locale)}
            {request.startDate !== request.endDate &&
              ` - ${formatDate(request.endDate, locale)}`}
            <span className="text-text-muted">
              {' '}
              · {t('leave.days', { count: request.totalDays })}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function EventItem({ event, onClick }: { event: DashboardEvent; onClick?: () => void }) {
  const { t } = useTranslation('dashboard');
  const style = EVENT_STYLE[event.kind];
  const Icon = style.icon;
  const content = (
    <>
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          style.wrap,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-text-primary text-sm truncate">
          {t(`events.${style.titleKey}`, { name: event.employeeName, years: event.years })}
        </div>
        {event.department && (
          <div className="text-xs text-text-muted mt-0.5 truncate">{event.department}</div>
        )}
      </div>
      <div className="px-2.5 py-1 rounded-md bg-surface-alt text-xs font-medium text-text-primary tabular-nums">
        {formatEventDate(event.date)}
      </div>
    </>
  );

  // SPEC-034 §3: an event with an action target renders as a button (keyboard +
  // screen-reader reachable); without one it stays a plain row.
  if (!onClick) {
    return (
      <div className="flex items-center gap-3 py-3 border-b border-surface-alt last:border-b-0">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 py-3 px-2 -mx-2 border-b border-surface-alt
        last:border-b-0 rounded-md cursor-pointer transition-colors duration-100
        hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {content}
    </button>
  );
}

function LeaveBalanceCard({ balance }: { balance: DashboardLeaveBalance }) {
  const { t } = useTranslation('dashboard');
  const swatch = balance.leaveType.colorHex ?? undefined;
  return (
    <div className="bg-surface-alt rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {swatch && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: swatch }}
            aria-hidden="true"
          />
        )}
        <span className="text-sm font-medium text-text-primary truncate">
          {balance.leaveType.name}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-text-primary tabular-nums">
          {balance.remaining}
        </span>
        <span className="text-xs text-text-muted">{t('leaveBalance.remaining')}</span>
      </div>
      <p className="text-xs text-text-secondary m-0 tabular-nums">
        {t('leaveBalance.usedOf', { used: balance.used, allocated: balance.allocated })}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { can } = usePermission();
  const user = useAuthStore((s) => s.user);
  const { data: dashboard, isLoading, isError } = useDashboard();
  const stats = dashboard?.stats;
  const pendingLeave = dashboard?.pendingLeave ?? [];
  const upcomingEvents = dashboard?.upcomingEvents ?? [];
  const myLeaveBalance = dashboard?.myLeaveBalance ?? [];

  // Role-adaptive: pick which widgets to render from the server-authoritative
  // role. While loading (no role yet) we show the stats skeleton as a neutral
  // placeholder; the role-specific grid only renders once data arrives.
  const role = dashboard?.role;
  const widgets = role ? DASHBOARD_LAYOUT_BY_ROLE[role] : [];
  const showWidget = (w: DashboardWidget) => widgets.includes(w);

  // SPEC-034 §3 — shared with the event calendar (SPEC-035).
  const eventTarget = useEventNavigation();

  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary m-0">
            {t('greeting', { name: user?.fullName || 'Admin' })}
          </h1>
          <p className="text-sm text-text-secondary">{today}</p>
        </div>
        {/* Quick actions gated by RBAC — UX-only; routes are re-checked server-side. */}
        {(can('employees:view') || can('employees:create')) && (
          <div className="flex gap-3">
            {can('employees:view') && (
              <Button variant="secondary" onClick={() => navigate('/employees')}>
                <Eye className="w-[18px] h-[18px] mr-2" />
                {t('actions.viewEmployees')}
              </Button>
            )}
            {can('employees:create') && (
              <Button onClick={() => navigate('/employees/new')}>
                <Plus className="w-[18px] h-[18px] mr-2" />
                {t('actions.addEmployee')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stats Grid — company/team scope (skeleton while loading, hidden for EMPLOYEE) */}
      {isError ? (
        <div
          role="alert"
          className="bg-danger-light border border-danger/30 text-danger rounded-xl px-5 py-4 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('errorLoad')}
        </div>
      ) : isLoading || !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : showWidget('stats') ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            title={t('stats.totalEmployees')}
            value={stats.totalActive}
            icon={Users}
            tone="primary"
          />
          <StatCard
            title={t('stats.onLeaveToday')}
            value={stats.onLeaveToday}
            icon={Calendar}
            tone="warning"
            subtitle={t('stats.activeWorking', { count: stats.totalActive })}
          />
          <StatCard
            title={t('stats.pendingApprovals')}
            value={stats.pendingApprovals}
            icon={FileText}
            tone="info"
            subtitle={t('stats.needAction')}
          />
          <StatCard
            title={t('footer.newHires')}
            value={stats.newHiresThisMonth}
            icon={UserCheck}
            tone="success"
          />
        </div>
      ) : null}

      {/* Leave Balance — EMPLOYEE self-service only (populated for self scope) */}
      {showWidget('leaveBalance') && myLeaveBalance.length > 0 && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center">
            <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
              <Wallet className="w-[18px] h-[18px] text-text-secondary" />
              {t('sections.leaveBalance')}
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {myLeaveBalance.map((balance, i) => (
              <LeaveBalanceCard key={`${balance.leaveType.name}-${i}`} balance={balance} />
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Department Distribution — company scope only */}
        {showWidget('deptDistribution') && (
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
                <Building2 className="w-[18px] h-[18px] text-text-secondary" />
                {t('sections.deptDistribution')}
              </h3>
              <button
                type="button"
                className="bg-transparent border-none text-primary text-sm font-medium cursor-pointer flex items-center gap-1 hover:underline"
              >
                {t('links.detail')}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5">
              <DepartmentChart data={dashboard?.departmentDistribution ?? []} />
            </div>
          </div>
        )}

        {/* Pending Leave Requests */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
              <FileText className="w-[18px] h-[18px] text-text-secondary" />
              {t('sections.pendingLeave')}
              {pendingLeave.length > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-danger-light text-danger text-xs font-semibold">
                  {pendingLeave.length}
                </span>
              )}
            </h3>
            <button
              type="button"
              className="bg-transparent border-none text-primary text-sm font-medium cursor-pointer flex items-center gap-1 hover:underline"
              onClick={() => navigate('/leave')}
            >
              {t('links.viewAll')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-5 py-2">
            {pendingLeave.length > 0 ? (
              pendingLeave.map((request) => (
                <PendingLeaveItem key={request.id} request={request} />
              ))
            ) : (
              <div className="text-center py-8 text-text-muted text-sm">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="m-0">{t('leave.nonePending')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
              <Calendar className="w-[18px] h-[18px] text-text-secondary" />
              {t('sections.upcomingEvents')}
            </h3>
            <button
              type="button"
              className="bg-transparent border-none text-primary text-sm font-medium cursor-pointer flex items-center gap-1 hover:underline"
              onClick={() => navigate('/calendar')}
            >
              {t('links.viewCalendar')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-5 py-2">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((event, i) => (
                <EventItem
                  key={`${event.kind}-${event.employeeName}-${event.date}-${i}`}
                  event={event}
                  onClick={eventTarget(event)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-text-muted text-sm">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-60" />
                <p className="m-0">{t('events.none')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Footer — company scope only */}
      {showWidget('footer') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-border shadow-sm flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-lg bg-danger-light flex items-center justify-center">
              <UserX className="w-5 h-5 text-danger" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-primary m-0 tabular-nums">
                {stats?.terminatedThisMonth ?? '—'}
              </p>
              <p className="text-xs text-text-secondary m-0">{t('footer.terminated')}</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-primary m-0 tabular-nums">
                {stats?.departmentCount ?? '—'}
              </p>
              <p className="text-xs text-text-secondary m-0">{t('footer.departments')}</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-lg bg-warning-light flex items-center justify-center">
              <Calendar className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-primary m-0 tabular-nums">
                {upcomingEvents.length}
              </p>
              <p className="text-xs text-text-secondary m-0">{t('footer.upcomingEvents')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
