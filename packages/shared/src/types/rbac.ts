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
  // Payment request / hoàn ứng (SPEC-041). `mark_paid` = đánh dấu đã chi trả sau khi
  // duyệt xong (kế toán/Founder). Luồng duyệt cố định NV → Quản lý → Founder; scope
  // (mine/review/all) + "đúng người duyệt bước hiện tại" enforce ở service.
  payment_request: ['view', 'create', 'update', 'approve', 'reject', 'mark_paid', 'export'],
  // Purchase request / đề xuất mua hàng (SPEC-042). `mark_ordered` = đánh dấu đã
  // phát hành PO cho NCC sau khi duyệt xong (mua hàng/Founder). Luồng duyệt cố định
  // NV → Quản lý → Founder; scope (mine/review/all) + "đúng người duyệt bước hiện
  // tại" enforce ở service.
  purchase_request: ['view', 'create', 'update', 'approve', 'reject', 'mark_ordered', 'export'],
  contracts: ['view', 'create', 'update', 'delete'],
  // Probation review (SPEC-030). `review` = manager scorecard/submit; `decide` =
  // HR final decision; `configure` = manage evaluation criteria; `self` = nhân viên
  // thử việc tự đánh giá review của CHÍNH MÌNH (SPEC-033 — ownership check ở controller).
  probation: ['view', 'review', 'decide', 'configure', 'self'],
  // KPI / Performance Management (SPEC-044). `config` = quản lý framework/pillar/KPI/
  // weight profile/rating band (HR); `enter` = nhập số liệu thực tế; `self_assess` =
  // nhân viên tự đánh giá scorecard của CHÍNH MÌNH; `review` = manager calibrate +
  // nhận xét; `approve` = duyệt chuỗi review + finalize; `view_team`/`view_all` mở rộng
  // phạm vi xem; `survey_manage` = quản lý survey Team Health. Scope enforce ở service.
  kpi: ['view', 'view_team', 'view_all', 'config', 'enter', 'self_assess', 'review', 'approve', 'export', 'survey_manage'],
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
  // Sales / CRM (SPEC-045). Single-colon keys per catalog convention: resource
  // `sales`, action `entity_verb` (sub-entity encoded in the action). Visibility
  // is owner-scoped server-side; `view_all` widens to the whole team. `assign` =
  // gán/chuyển owner cho người khác; `settings` = cấu hình pipeline/template/sản phẩm.
  sales: [
    'customer_view', 'customer_create', 'customer_update', 'customer_assign',
    'deal_view', 'deal_create', 'deal_update', 'deal_move',
    'product_view', 'product_manage',
    'quote_view', 'quote_manage',
    'task_view', 'task_manage',
    'email_send', 'template_manage',
    'report_view', 'view_all', 'settings',
  ],
  // Ngân sách & Dòng tiền (SPEC-048). `finance` = xem Dashboard/báo cáo tổng +
  // export; `fund_account` = quản lý tài khoản quỹ; `cash_transaction` = sổ giao
  // dịch thu/chi (kèm `import` từ Excel). Đa pháp nhân qua IssuingEntity; tenant-
  // scoped + RBAC server-side. (spending_plan / topup_request thêm ở GĐ2/GĐ3.)
  finance: ['view', 'export'],
  fund_account: ['view', 'create', 'update', 'delete'],
  cash_transaction: ['view', 'create', 'update', 'delete', 'import'],
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
