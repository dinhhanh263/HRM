import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { PERMISSION_KEYS } from '@hrm/shared';

// Permission catalog keys come from @hrm/shared (single source of truth shared
// with the web client). We re-export under the legacy name used by the seed.
export const ALL_PERMISSION_KEYS: string[] = PERMISSION_KEYS;

export interface SystemRoleDef {
  enum: UserRole;
  key: string;
  name: string;
  description: string;
  // '*' => wildcard (every permission); otherwise explicit permission keys.
  permissions: '*' | string[];
}

// 5 system roles seeded per tenant, mapped from the legacy UserRole enum.
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    enum: UserRole.SUPER_ADMIN,
    key: 'super_admin',
    name: 'Quản trị hệ thống',
    description: 'Toàn quyền cấu hình hệ thống và phân quyền',
    permissions: '*',
  },
  {
    enum: UserRole.HR_MANAGER,
    key: 'hr_manager',
    name: 'Quản lý nhân sự',
    description: 'Toàn quyền nghiệp vụ nhân sự',
    permissions: [
      'dashboard:view',
      'employees:view', 'employees:create', 'employees:update', 'employees:delete',
      'employees:activate', 'employees:deactivate', 'employees:terminate', 'employees:export',
      'employees:import',
      'departments:view', 'departments:create', 'departments:update', 'departments:delete',
      'positions:view', 'positions:create', 'positions:update', 'positions:delete',
      'timesheet:view', 'timesheet:update', 'timesheet:approve', 'timesheet:configure',
      'leave:view', 'leave:create', 'leave:update', 'leave:approve', 'leave:reject', 'leave:configure',
      'payroll:view', 'payroll:process', 'payroll:export',
      // SPEC-041: HR thường kiêm kế toán → được duyệt + đánh dấu đã trả.
      'payment_request:view', 'payment_request:create', 'payment_request:approve',
      'payment_request:reject', 'payment_request:mark_paid', 'payment_request:export',
      'contracts:view', 'contracts:create', 'contracts:update', 'contracts:delete',
      'probation:view', 'probation:review', 'probation:decide', 'probation:configure',
      'probation:self',
      'assets:view', 'assets:create', 'assets:update', 'assets:delete',
      'assets:assign', 'assets:acknowledge', 'assets:maintain', 'assets:dispose', 'assets:configure',
      'assets:export', 'assets:import',
      'notifications:view',
      'users:view', 'users:create', 'users:update', 'users:delete',
      'settings:view', 'settings:update',
      'recruitment:job_view', 'recruitment:job_create', 'recruitment:job_update',
      'recruitment:candidate_view', 'recruitment:candidate_create', 'recruitment:candidate_update',
      'recruitment:application_view', 'recruitment:application_create',
      'recruitment:application_move', 'recruitment:application_force_move',
      'recruitment:application_reject',
      'recruitment:application_hire', 'recruitment:application_withdraw',
      'recruitment:application_note',
      'recruitment:interview_schedule',
      'recruitment:scorecard_submit',
      'recruitment:bulk_import',
    ],
  },
  {
    enum: UserRole.PAYROLL_APPROVER,
    key: 'payroll_approver',
    name: 'Phê duyệt lương',
    description: 'Phê duyệt bảng lương (Giám đốc/Kế toán trưởng) — tách biệt với người tính lương',
    permissions: [
      'dashboard:view',
      'payroll:view', 'payroll:approve',
      'notifications:view',
      // SPEC-033: giám đốc/kế toán trưởng cũng có thể là người đang thử việc.
      'probation:self',
    ],
  },
  {
    enum: UserRole.MANAGER,
    key: 'manager',
    name: 'Quản lý',
    description: 'Xem thông tin và duyệt cho nhóm phụ trách',
    permissions: [
      'dashboard:view',
      'employees:view', 'employees:export',
      'departments:view',
      'positions:view',
      'timesheet:view', 'timesheet:update', 'timesheet:approve',
      'leave:view', 'leave:create', 'leave:approve', 'leave:reject',
      'payroll:view',
      // SPEC-041: duyệt/trả về/từ chối đơn của nhân viên cấp dưới (scope enforce ở service).
      'payment_request:view', 'payment_request:create',
      'payment_request:approve', 'payment_request:reject',
      'contracts:view',
      // MANAGER evaluates direct reports (scope enforced server-side) but cannot
      // make the final decision or configure criteria — those are HR-only.
      // `self`: manager cũng có thể là người đang thử việc (SPEC-033).
      'probation:view', 'probation:review', 'probation:self',
      'assets:view', 'assets:acknowledge', 'assets:export',
      'notifications:view',
      'recruitment:job_view',
      'recruitment:candidate_view',
      'recruitment:application_view', 'recruitment:application_move',
      'recruitment:application_note',
      'recruitment:interview_schedule',
      'recruitment:scorecard_submit',
    ],
  },
  {
    enum: UserRole.EMPLOYEE,
    key: 'employee',
    name: 'Nhân viên',
    description: 'Tự phục vụ: chấm công, nghỉ phép, hồ sơ cá nhân',
    permissions: [
      'dashboard:view',
      'employees:view',
      'timesheet:view', 'timesheet:create',
      'leave:view', 'leave:create',
      'payroll:view',
      // SPEC-041: nhân viên tạo & xem đơn thanh toán của chính mình (scope ở service).
      'payment_request:view', 'payment_request:create',
      'contracts:view',
      'assets:view', 'assets:acknowledge',
      'notifications:view',
      // SPEC-033: tự đánh giá thử việc — chỉ trên review của chính mình
      // (ownership check ở controller), không kèm probation:view.
      'probation:self',
      // An EMPLOYEE who is an interview panellist can submit their own scorecard,
      // but does NOT get candidate_view — that grant is unscoped (the service does
      // no hiring-team membership filtering), so it would expose every candidate's
      // PII to all staff. Candidate browsing stays with recruiter/HR roles.
      'recruitment:scorecard_submit',
    ],
  },
];

/** Map a legacy UserRole enum value to its system-role key (e.g. HR_MANAGER → 'hr_manager'). */
export function roleKeyForUserRole(role: UserRole): string {
  const def = SYSTEM_ROLES.find((r) => r.enum === role);
  if (!def) {
    throw new Error(`No system role mapping for UserRole "${role}"`);
  }
  return def.key;
}

/**
 * Derive the legacy UserRole enum to store alongside user.roleId. A system-role
 * key maps to its matching enum; a custom-role key has no enum representation, so
 * it falls back to EMPLOYEE (neutral baseline — see SPEC-014 Đ2).
 */
export function userRoleForRoleKey(key: string): UserRole {
  const def = SYSTEM_ROLES.find((r) => r.key === key);
  return def ? def.enum : UserRole.EMPLOYEE;
}

/** Idempotent upsert of the global permission catalog. */
export async function seedPermissionCatalog(prisma: PrismaClient): Promise<void> {
  for (const key of ALL_PERMISSION_KEYS) {
    const [resource, action] = key.split(':');
    await prisma.permission.upsert({
      where: { key },
      update: { resource, action },
      create: { key, resource, action },
    });
  }
}

/**
 * Idempotently seed the 4 system roles for a tenant and sync their permission
 * mappings to the defaults. Returns a map of roleKey -> roleId. Assumes the
 * permission catalog has already been seeded.
 */
export async function syncSystemRolesForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, string>> {
  const permissionByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );

  const roleIdByKey = new Map<string, string>();

  for (const def of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: def.key } },
      update: { name: def.name, description: def.description, isSystem: true },
      create: {
        tenantId,
        key: def.key,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    roleIdByKey.set(def.key, role.id);

    const keys = def.permissions === '*' ? ALL_PERMISSION_KEYS : def.permissions;
    const desiredIds = keys
      .map((k) => permissionByKey.get(k))
      .filter((id): id is string => Boolean(id));
    const desiredSet = new Set(desiredIds);

    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((rp) => rp.permissionId));

    const toAdd = desiredIds.filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !desiredSet.has(id));

    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
    }
  }

  return roleIdByKey;
}
