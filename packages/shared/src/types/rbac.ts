// Permission catalog — global: the same keys apply to every tenant. Each key is
// `resource:action`. This is the single source of truth shared by the API
// (seeding + guards) and the web client (usePermission, <Can>, Roles matrix).
export const PERMISSION_CATALOG = {
  dashboard: ['view'],
  employees: ['view', 'create', 'update', 'delete', 'activate', 'deactivate', 'terminate', 'export', 'import'],
  departments: ['view', 'create', 'update', 'delete'],
  positions: ['view', 'create', 'update', 'delete'],
  timesheet: ['view', 'create', 'update', 'approve', 'configure'],
  leave: ['view', 'create', 'update', 'approve', 'reject', 'configure'],
  payroll: ['view', 'process', 'approve', 'export'],
  contracts: ['view', 'create', 'update', 'delete'],
  // Probation review (SPEC-030). `review` = manager scorecard/submit; `decide` =
  // HR final decision; `configure` = manage evaluation criteria; `self` = nhân viên
  // thử việc tự đánh giá review của CHÍNH MÌNH (SPEC-033 — ownership check ở controller).
  probation: ['view', 'review', 'decide', 'configure', 'self'],
  assets: ['view', 'create', 'update', 'delete', 'assign', 'acknowledge', 'maintain', 'dispose', 'configure', 'export', 'import'],
  notifications: ['view'],
  users: ['view', 'create', 'update', 'delete'],
  roles: ['view', 'create', 'update', 'delete'],
  settings: ['view', 'update'],
  // Recruitment / ATS (SPEC-024). Single-colon keys per the catalog convention:
  // resource `recruitment`, action `entity_verb` (sub-entity encoded in the action).
  recruitment: [
    'job_view', 'job_create', 'job_update',
    'candidate_view', 'candidate_create', 'candidate_update',
    'application_view', 'application_create', 'application_move',
    'application_force_move',
    'application_reject', 'application_hire', 'application_withdraw',
    'application_note',
    'interview_schedule',
    'scorecard_submit',
    'bulk_import',
  ],
} as const;

export type PermissionResource = keyof typeof PERMISSION_CATALOG;

// Union of every `resource:action` literal, derived from the catalog above.
export type PermissionKey = {
  [R in PermissionResource]: `${R}:${(typeof PERMISSION_CATALOG)[R][number]}`;
}[PermissionResource];

export const PERMISSION_KEYS: PermissionKey[] = (
  Object.entries(PERMISSION_CATALOG) as [PermissionResource, readonly string[]][]
).flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}` as PermissionKey));

export interface PermissionDto {
  id: string;
  key: string;
  resource: string;
  action: string;
}

export interface RoleDto {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

// Lightweight row for the roles list table — avoids shipping the full permission
// array per role. permissionCount drives the matrix summary; userCount gates delete.
export interface RoleListItemDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

// Permission catalog grouped by resource — drives the matrix rows/columns.
export interface PermissionCatalogGroup {
  resource: string;
  actions: { key: string; action: string }[];
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissions?: string[];
}
