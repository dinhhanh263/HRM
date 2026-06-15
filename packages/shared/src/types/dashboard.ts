import type { UserRole } from './user.js';
import type { HolidayDto } from './timesheet.js';

// Aggregated, role-scoped data for the dashboard. Served by GET /api/v1/dashboard
// in a single round-trip; the server decides which optional blocks are populated
// based on the caller's role scope (company / team / self). See SPEC-009.

export interface DashboardStats {
  totalActive: number;
  onLeaveToday: number;
  pendingApprovals: number;
  newHiresThisMonth: number;
  terminatedThisMonth: number;
  departmentCount: number;
  // EMPLOYEE self-service: count of the caller's own PENDING leave requests.
  myPendingRequests?: number;
}

export interface DashboardDepartmentSlice {
  departmentId: string;
  name: string;
  count: number;
}

// Compact, read-only view of a pending leave request for the dashboard widget.
// The widget links to /leave; it never approves/rejects here.
export interface DashboardPendingLeave {
  id: string;
  employeeName: string;
  leaveType: { name: string; colorHex: string | null };
  startDate: string;
  endDate: string;
  totalDays: number;
  createdAt: string;
}

export interface DashboardLeaveBalance {
  leaveType: { name: string; colorHex: string | null };
  allocated: number;
  used: number;
  remaining: number;
}

export type DashboardEventKind =
  | 'birthday'
  | 'anniversary'
  | 'new_joiner'
  | 'probation_ending'
  | 'contract_expiring';

export interface DashboardEvent {
  kind: DashboardEventKind;
  // Deep-link target: the employee this event is about (SPEC-034).
  employeeId: string;
  employeeName: string;
  department: string | null;
  date: string;
  // Only for `anniversary`: completed years of service on `date` (>= 1).
  years?: number;
}

// SPEC-035: payload of GET /dashboard/events?month= — events falling inside the
// month (scoped per actor) plus the tenant's holidays of that month.
export interface CalendarMonthData {
  month: string; // YYYY-MM
  events: DashboardEvent[];
  holidays: HolidayDto[];
}

export interface DashboardData {
  role: UserRole;
  stats: DashboardStats;
  // HR/Admin only.
  departmentDistribution?: DashboardDepartmentSlice[];
  pendingLeave: DashboardPendingLeave[];
  // EMPLOYEE self-service only.
  myLeaveBalance?: DashboardLeaveBalance[];
  upcomingEvents: DashboardEvent[];
}
