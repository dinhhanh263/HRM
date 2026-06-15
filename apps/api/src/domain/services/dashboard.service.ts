import type {
  CalendarMonthData,
  DashboardData,
  DashboardEvent,
  DashboardLeaveBalance,
  DashboardStats,
  UserRole,
} from '@hrm/shared';
import {
  dashboardRepository,
  type EventSourceEmployee,
} from '../repositories/dashboard.repository.js';
import { ictDayNumber, ictISODate } from '../reminders/reminders.service.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { holidayService } from './holiday.service.js';
import { leaveBalanceService } from './leave-balance.service.js';
import { permissionService } from './permission.service.js';
import { settingsService } from './settings.service.js';

interface DashboardActor {
  sub: string;
  tenantId: string;
  role: UserRole;
  roleId?: string | null;
}

// The server-side security boundary: every aggregate query is constrained to
// this scope. Never inferred from the client.
type DashboardScope =
  | { kind: 'company' }
  | { kind: 'team'; employeeId: string; memberIds: string[] }
  | { kind: 'self'; employeeId: string };

/** First instant of the current month and of the next month (handles Dec→Jan). */
export function monthRange(now: Date): { start: Date; next: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    next: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

/** Start and end instants of the calendar day `now` falls in. */
export function dayRange(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

const MS_PER_DAY = 86_400_000;

// Lifecycle-event lead windows (mirror the reminder engine's leads). Probation
// nudges HR a week out; contract expiry a month out.
const PROBATION_WINDOW_DAYS = 7;
const CONTRACT_WINDOW_DAYS = 30;

/** Local calendar date `YYYY-MM-DD`; events are day-granular, so no time/zone. */
function toISODate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Next date (>= today) on which `month`/`day` recurs, rolling into next year. */
function nextOccurrence(month: number, day: number, todayStart: Date): Date {
  const candidate = new Date(todayStart.getFullYear(), month, day, 0, 0, 0, 0);
  if (candidate.getTime() < todayStart.getTime()) {
    return new Date(todayStart.getFullYear() + 1, month, day, 0, 0, 0, 0);
  }
  return candidate;
}

// Which lifecycle kinds to emit, per scope. Company scope gets both; team scope
// gets probation only (contracts stay HR's job) and never the manager's own —
// their probation is reviewed by *their* manager, so the event would dead-end.
// Lead days (SPEC-036) override the 7/30 defaults from tenant settings.
export interface LifecycleEventOptions {
  probation?: boolean;
  contract?: boolean;
  probationExcludeEmployeeId?: string;
  probationLeadDays?: number;
  contractLeadDays?: number;
}

/**
 * Pure derivation of upcoming birthdays, work anniversaries, and new joiners
 * within `windowDays` of `now`. Recurring events roll over the year boundary;
 * anniversaries require at least one completed year.
 *
 * Probation-ending and contract-expiring events are emitted per `lifecycle`,
 * each within its own lead window.
 */
export function deriveUpcomingEvents(
  employees: EventSourceEmployee[],
  now: Date,
  windowDays = 30,
  lifecycle: LifecycleEventOptions = {},
): DashboardEvent[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const windowEndMs = todayMs + windowDays * MS_PER_DAY;
  const inWindow = (d: Date) => d.getTime() >= todayMs && d.getTime() <= windowEndMs;

  // Lifecycle dates (probation/contract end) are day-only values persisted as UTC
  // midnight and must be windowed on the *ICT* calendar so the dashboard agrees
  // with the reminder scan exactly, independent of the server's timezone.
  const ictToday = ictDayNumber(now);
  const withinIctDays = (d: Date, days: number) => {
    const delta = ictDayNumber(d) - ictToday;
    return delta >= 0 && delta <= days;
  };

  const events: DashboardEvent[] = [];
  for (const e of employees) {
    if (e.dateOfBirth) {
      const next = nextOccurrence(e.dateOfBirth.getMonth(), e.dateOfBirth.getDate(), todayStart);
      if (inWindow(next)) {
        events.push({
          kind: 'birthday',
          employeeId: e.id,
          employeeName: e.fullName,
          department: e.departmentName,
          date: toISODate(next),
        });
      }
    }

    const anniv = nextOccurrence(e.joinDate.getMonth(), e.joinDate.getDate(), todayStart);
    const years = anniv.getFullYear() - e.joinDate.getFullYear();
    if (years >= 1 && inWindow(anniv)) {
      events.push({
        kind: 'anniversary',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: toISODate(anniv),
        years,
      });
    }

    if (inWindow(e.joinDate)) {
      events.push({
        kind: 'new_joiner',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: toISODate(e.joinDate),
      });
    }

    if (
      lifecycle.probation &&
      e.id !== lifecycle.probationExcludeEmployeeId &&
      e.probationEndDate &&
      withinIctDays(e.probationEndDate, lifecycle.probationLeadDays ?? PROBATION_WINDOW_DAYS)
    ) {
      events.push({
        kind: 'probation_ending',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: ictISODate(e.probationEndDate),
      });
    }
    // Indefinite contracts (contractEndDate null) are naturally excluded.
    if (
      lifecycle.contract &&
      e.contractEndDate &&
      withinIctDays(e.contractEndDate, lifecycle.contractLeadDays ?? CONTRACT_WINDOW_DAYS)
    ) {
      events.push({
        kind: 'contract_expiring',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: ictISODate(e.contractEndDate),
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * SPEC-035 — pure derivation of every event whose date falls inside `monthKey`
 * (`YYYY-MM`). Unlike the dashboard widget there are no lead windows: the month
 * grid shows a probation end on its actual date even three weeks out.
 * Recurring kinds use the local-date formatting the widget already uses;
 * lifecycle kinds stay on the ICT calendar (matching the reminder scan).
 */
export function deriveMonthEvents(
  employees: EventSourceEmployee[],
  monthKey: string,
  lifecycle: LifecycleEventOptions = {},
): DashboardEvent[] {
  const gridYear = Number(monthKey.slice(0, 4));
  const inMonth = (iso: string) => iso.startsWith(monthKey);

  const events: DashboardEvent[] = [];
  for (const e of employees) {
    if (e.dateOfBirth) {
      // Occurrence in the grid year; Feb-29 birthdays roll to Mar-01 off leap
      // years, same as the widget's nextOccurrence.
      const occurrence = new Date(gridYear, e.dateOfBirth.getMonth(), e.dateOfBirth.getDate());
      const iso = toISODate(occurrence);
      if (inMonth(iso)) {
        events.push({
          kind: 'birthday',
          employeeId: e.id,
          employeeName: e.fullName,
          department: e.departmentName,
          date: iso,
        });
      }
    }

    const anniversary = new Date(gridYear, e.joinDate.getMonth(), e.joinDate.getDate());
    const years = gridYear - e.joinDate.getFullYear();
    const anniversaryIso = toISODate(anniversary);
    if (years >= 1 && inMonth(anniversaryIso)) {
      events.push({
        kind: 'anniversary',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: anniversaryIso,
        years,
      });
    }

    const joinIso = toISODate(e.joinDate);
    if (inMonth(joinIso)) {
      events.push({
        kind: 'new_joiner',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: joinIso,
      });
    }

    if (
      lifecycle.probation &&
      e.id !== lifecycle.probationExcludeEmployeeId &&
      e.probationEndDate &&
      inMonth(ictISODate(e.probationEndDate))
    ) {
      events.push({
        kind: 'probation_ending',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: ictISODate(e.probationEndDate),
      });
    }
    if (lifecycle.contract && e.contractEndDate && inMonth(ictISODate(e.contractEndDate))) {
      events.push({
        kind: 'contract_expiring',
        employeeId: e.id,
        employeeName: e.fullName,
        department: e.departmentName,
        date: ictISODate(e.contractEndDate),
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

async function resolveScope(actor: DashboardActor): Promise<DashboardScope> {
  // System roles carry an accurate legacy enum, so keep their fast-path (no
  // permission lookup needed for the two company-wide roles).
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HR_MANAGER') {
    return { kind: 'company' };
  }

  // A CUSTOM role is stored with a neutral EMPLOYEE enum (SPEC-014 Đ2), so the
  // enum under-reports its real reach. Derive scope from the role's actual
  // permissions instead — same HR/manager scope gates the timesheet, payroll and
  // leave controllers use. System roles pass roleId here too; their permissions
  // match their enum, so behaviour is unchanged.
  const granted = actor.roleId
    ? await permissionService.getPermissionsForRole(actor.roleId)
    : new Set<string>();

  // Company-wide oversight = can manage the workforce (HR-level). MANAGER and
  // EMPLOYEE only hold employees:view, so this cleanly separates HR from them.
  if (granted.has('employees:update')) {
    return { kind: 'company' };
  }

  const employee = await employeeRepository.findByUserId(actor.sub, actor.tenantId);
  if (!employee) {
    // A non-company role with no linked profile sees nothing, not the company.
    return { kind: 'self', employeeId: '' };
  }

  // Team scope = a reviewer with direct reports. The MANAGER enum keeps its
  // fast-path; a custom role earns team scope via the manager-level review
  // capabilities (leave:approve / timesheet:approve).
  if (actor.role === 'MANAGER' || granted.has('leave:approve') || granted.has('timesheet:approve')) {
    const reportIds = await dashboardRepository.findReportIds(employee.id, actor.tenantId);
    return { kind: 'team', employeeId: employee.id, memberIds: [employee.id, ...reportIds] };
  }
  return { kind: 'self', employeeId: employee.id };
}

/**
 * Lifecycle kinds per scope (SPEC-034 §2): company = both; team = reports'
 * probation only. `leads` (SPEC-036) carries the tenant-configured windows.
 */
function lifecycleOptions(
  scope: DashboardScope,
  leads?: { probationLeadDays: number; contractLeadDays: number },
): LifecycleEventOptions {
  if (scope.kind === 'company') return { probation: true, contract: true, ...leads };
  if (scope.kind === 'team') {
    return { probation: true, probationExcludeEmployeeId: scope.employeeId, ...leads };
  }
  return {};
}

/** `undefined` = company-wide; otherwise the exact set of employee ids in scope. */
function scopeToEmployeeFilter(scope: DashboardScope): string[] | undefined {
  if (scope.kind === 'company') return undefined;
  if (scope.kind === 'team') return scope.memberIds;
  // Empty id = profile-less user → no employees in scope.
  return scope.employeeId ? [scope.employeeId] : [];
}

export const dashboardService = {
  async getDashboard(actor: DashboardActor, now: Date = new Date()): Promise<DashboardData> {
    const scope = await resolveScope(actor);
    const employeeFilter = scopeToEmployeeFilter(scope);
    const { tenantId } = actor;

    const { start: monthStart, next: nextMonthStart } = monthRange(now);
    const { start: dayStart, end: dayEnd } = dayRange(now);

    // Self-service blocks are scoped to the caller's own profile, so they are
    // only fetched when the caller is a single employee (EMPLOYEE self scope).
    const selfEmployeeId = scope.kind === 'self' && scope.employeeId ? scope.employeeId : null;

    const [
      totalActive,
      onLeaveToday,
      pendingApprovals,
      newHiresThisMonth,
      terminatedThisMonth,
      departmentCount,
      departmentDistribution,
      pendingLeave,
      eventSource,
      ownBalances,
      notificationLeads,
    ] = await Promise.all([
      dashboardRepository.countActiveEmployees(tenantId, employeeFilter),
      dashboardRepository.countOnLeaveToday(tenantId, employeeFilter, dayStart, dayEnd),
      dashboardRepository.countPendingLeave(tenantId, employeeFilter),
      dashboardRepository.countNewHires(tenantId, employeeFilter, monthStart, nextMonthStart),
      dashboardRepository.countTerminated(tenantId, employeeFilter, monthStart, nextMonthStart),
      dashboardRepository.countActiveDepartments(tenantId, employeeFilter),
      scope.kind === 'company'
        ? dashboardRepository.departmentDistribution(tenantId, employeeFilter)
        : Promise.resolve(undefined),
      dashboardRepository.findPendingLeave(tenantId, employeeFilter),
      dashboardRepository.findEventSourceEmployees(tenantId, employeeFilter),
      selfEmployeeId
        ? leaveBalanceService.getBalances(tenantId, selfEmployeeId, now.getFullYear())
        : Promise.resolve(undefined),
      settingsService.getNotificationSettings(tenantId),
    ]);

    const stats: DashboardStats = {
      totalActive,
      onLeaveToday,
      pendingApprovals,
      newHiresThisMonth,
      terminatedThisMonth,
      departmentCount,
    };
    // For self scope the scoped pending count *is* the caller's own pending requests.
    if (selfEmployeeId) stats.myPendingRequests = pendingApprovals;

    const myLeaveBalance: DashboardLeaveBalance[] | undefined = ownBalances?.map((b) => ({
      leaveType: { name: b.leaveTypeName, colorHex: b.colorHex },
      allocated: b.allocated,
      used: b.used,
      remaining: b.remaining,
    }));

    return {
      role: actor.role,
      stats,
      departmentDistribution,
      pendingLeave,
      myLeaveBalance,
      upcomingEvents: deriveUpcomingEvents(
        eventSource,
        now,
        30,
        lifecycleOptions(scope, notificationLeads),
      ),
    };
  },

  /**
   * SPEC-035 — month view for the event calendar. Same security boundary as the
   * dashboard: scope is resolved server-side from the actor, never the client.
   * Holidays are tenant-wide public info, so every dashboard viewer gets them.
   */
  async getCalendarEvents(actor: DashboardActor, monthKey: string): Promise<CalendarMonthData> {
    const scope = await resolveScope(actor);
    const employeeFilter = scopeToEmployeeFilter(scope);
    const year = Number(monthKey.slice(0, 4));

    const [eventSource, yearHolidays] = await Promise.all([
      dashboardRepository.findEventSourceEmployees(actor.tenantId, employeeFilter),
      holidayService.listByYear(actor.tenantId, year),
    ]);

    return {
      month: monthKey,
      events: deriveMonthEvents(eventSource, monthKey, lifecycleOptions(scope)),
      holidays: yearHolidays.filter((h) => h.date.startsWith(monthKey)),
    };
  },
};
