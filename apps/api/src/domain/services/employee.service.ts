import { employeeRepository, type EmployeeFilters, type PaginationOptions } from '../repositories/employee.repository.js';
import { departmentRepository } from '../repositories/department.repository.js';
import { positionRepository } from '../repositories/position.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import { generateEmployeeCode } from '../../shared/helpers/employee-code.helper.js';
import { wouldCreateManagerCycle } from '../../shared/helpers/manager-cycle.helper.js';
import { roleKeyForUserRole, userRoleForRoleKey } from '../rbac/catalog.js';
import { leaveAllocationService } from './leave-allocation.service.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../infrastructure/database/client.js';
import type { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

/** Assignable roles via the employee UI. SUPER_ADMIN is intentionally excluded
 * (not a privilege-escalation path through this form). */
type AssignableRole = 'EMPLOYEE' | 'MANAGER' | 'HR_MANAGER' | 'PAYROLL_APPROVER';

/**
 * Resolve the tenant's Role row id for a UserRole enum so user.roleId — the
 * column RBAC reads — stays in sync with the legacy role enum.
 */
async function resolveRoleId(tenantId: string, role: UserRole): Promise<string> {
  const roleRow = await roleRepository.findByKey(roleKeyForUserRole(role), tenantId);
  if (!roleRow) {
    throw new BadRequestError('Role not provisioned for tenant', 'ROLE_NOT_PROVISIONED');
  }
  return roleRow.id;
}

/**
 * Resolve an explicit roleId (system or custom) into the {roleId, role} pair to
 * persist. The role must belong to the tenant (cross-tenant ids are rejected) and
 * cannot be super_admin (no privilege escalation via the employee form — Đ3). The
 * legacy enum is derived per Đ2: system key → matching enum, custom → EMPLOYEE.
 */
async function resolveRoleAssignment(
  tenantId: string,
  roleId: string,
): Promise<{ roleId: string; role: UserRole }> {
  const role = await roleRepository.findById(roleId, tenantId);
  if (!role) {
    throw new BadRequestError('Role not found', 'ROLE_NOT_FOUND');
  }
  if (role.key === 'super_admin') {
    throw new BadRequestError('Cannot assign the super_admin role', 'ROLE_NOT_ASSIGNABLE');
  }
  return { roleId: role.id, role: userRoleForRoleKey(role.key) };
}

/**
 * Who is asking — used to scope directory reads. `role` is the legacy UserRole
 * enum carried on the JWT. Anyone outside FULL_DIRECTORY_ROLES is restricted to
 * their own record (and, for a MANAGER, their direct reports).
 */
export interface Requester {
  userId: string;
  role: string;
}

// Roles that may read the entire employee directory. Everyone else is scoped
// down to themselves (+ direct reports for a manager). SUPER_ADMIN normally
// bypasses RBAC at the middleware layer, but is listed here so service-level
// scoping is correct even if it is ever called directly.
const FULL_DIRECTORY_ROLES = new Set(['SUPER_ADMIN', 'HR_MANAGER']);

type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'OTHER';

/**
 * Extended employee profile fields (SPEC-040). All optional; on update a `null`
 * (or empty string for free text) clears the stored value.
 */
export interface ExtendedEmployeeFields {
  placeOfBirth?: string | null;
  idIssueDate?: string | null;
  idIssuePlace?: string | null;
  personalEmail?: string | null;
  education?: string | null;
  maritalStatus?: MaritalStatus | null;
  permanentAddress?: string | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  taxCode?: string | null;
  socialInsuranceNumber?: string | null;
  healthcareFacility?: string | null;
  motorbikeRegistration?: string | null;
}

/**
 * Build the Prisma data slice for the extended profile fields. In `create` mode
 * blanks become `undefined` (column left at its default); in `update` mode an
 * empty string or null clears the column while `undefined` leaves it untouched.
 * The id-issue date is normalised string→Date in both modes.
 */
function buildExtendedData(input: ExtendedEmployeeFields, mode: 'create' | 'update') {
  const text = (v: string | null | undefined) =>
    mode === 'create' ? v || undefined : v === undefined ? undefined : v === '' ? null : v;
  return {
    placeOfBirth: text(input.placeOfBirth),
    idIssueDate:
      input.idIssueDate === undefined ? undefined : input.idIssueDate ? new Date(input.idIssueDate) : null,
    idIssuePlace: text(input.idIssuePlace),
    personalEmail: text(input.personalEmail),
    education: text(input.education),
    maritalStatus: input.maritalStatus === undefined ? undefined : input.maritalStatus || null,
    permanentAddress: text(input.permanentAddress),
    currentAddress: text(input.currentAddress),
    emergencyContactName: text(input.emergencyContactName),
    emergencyContactRelationship: text(input.emergencyContactRelationship),
    emergencyContactPhone: text(input.emergencyContactPhone),
    bankAccountNumber: text(input.bankAccountNumber),
    bankName: text(input.bankName),
    bankBranch: text(input.bankBranch),
    taxCode: text(input.taxCode),
    socialInsuranceNumber: text(input.socialInsuranceNumber),
    healthcareFacility: text(input.healthcareFacility),
    motorbikeRegistration: text(input.motorbikeRegistration),
  };
}

export interface CreateEmployeeInput extends ExtendedEmployeeFields {
  // Manually assigned employee code. Optional at the type level so internal
  // callers (bulk import, seeds) can omit it and fall back to auto-generation;
  // the HTTP validator makes it required for the create-employee endpoint.
  employeeCode?: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  idNumber?: string;
  phone?: string;
  email: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  joinDate?: string;
  probationEndDate?: string | null;
  contractType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'PROBATION';
  dependentsCount?: number;
  avatarUrl?: string;
  role?: AssignableRole;
  roleId?: string;
  password: string;
}

export interface UpdateEmployeeInput extends ExtendedEmployeeFields {
  fullName?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  idNumber?: string;
  phone?: string;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  joinDate?: string;
  probationEndDate?: string | null;
  contractType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'PROBATION';
  dependentsCount?: number;
  avatarUrl?: string;
  role?: AssignableRole;
  roleId?: string;
}

/**
 * Validate a direct-manager assignment: the manager must exist in the same
 * tenant, and (on update) assigning them must not create a reporting cycle.
 * `employeeId` is null on create — a brand-new employee has no reports yet, so
 * no cycle is possible.
 */
async function validateManagerAssignment(
  tenantId: string,
  managerId: string,
  employeeId: string | null
): Promise<void> {
  const manager = await employeeRepository.findById(managerId, tenantId);
  if (!manager) {
    throw new BadRequestError('Manager not found', 'EMPLOYEE_MANAGER_NOT_FOUND');
  }
  if (employeeId) {
    const cycle = await wouldCreateManagerCycle(employeeId, managerId, (id) =>
      employeeRepository.findManagerId(id, tenantId)
    );
    if (cycle) {
      throw new BadRequestError(
        'Manager assignment would create a reporting cycle',
        'EMPLOYEE_MANAGER_CYCLE'
      );
    }
  }
}

export const employeeService = {
  // Directory listing is row-level scoped by the requester's role:
  //  - HR_MANAGER / SUPER_ADMIN  → the whole tenant directory
  //  - MANAGER                   → themselves + their direct reports
  //  - everyone else (EMPLOYEE)  → only their own record
  // Scoping is enforced here (the service is the security boundary) rather than
  // in the route, because the frontend has no employeeId to self-check against.
  async getAll(
    tenantId: string,
    filters: EmployeeFilters,
    pagination: PaginationOptions,
    requester: Requester,
  ) {
    if (FULL_DIRECTORY_ROLES.has(requester.role)) {
      return employeeRepository.findAll(tenantId, filters, pagination);
    }

    const self = await employeeRepository.findByUserId(requester.userId, tenantId);
    // No linked employee record ⇒ nothing in scope (empty array, not "all").
    let ids: string[] = self ? [self.id] : [];
    if (self && requester.role === 'MANAGER') {
      const reportIds = await employeeRepository.findReportIds(self.id, tenantId);
      ids = [self.id, ...reportIds];
    }

    return employeeRepository.findAll(tenantId, { ...filters, ids }, pagination);
  },

  async getById(id: string, tenantId: string, requester: Requester) {
    const employee = await employeeRepository.findById(id, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (FULL_DIRECTORY_ROLES.has(requester.role)) {
      return employee;
    }

    // Own profile is always visible.
    if (employee.userId === requester.userId) {
      return employee;
    }

    // A manager may view their own direct reports.
    if (requester.role === 'MANAGER') {
      const self = await employeeRepository.findByUserId(requester.userId, tenantId);
      if (self && employee.managerId === self.id) {
        return employee;
      }
    }

    throw new ForbiddenError('You do not have access to this employee');
  },

  // `canAssignRole` gates the `role` field: assigning/altering a system role is a
  // privilege grant (e.g. PAYROLL_APPROVER ⇒ payroll:approve), so it is restricted
  // to SUPER_ADMIN by the controller. For any other caller the requested role is
  // ignored and the employee gets the default EMPLOYEE role — this preserves the
  // payroll maker-checker separation (an HR manager cannot self-grant approval).
  async create(tenantId: string, input: CreateEmployeeInput, canAssignRole = false) {
    const existingUser = await db.user.findFirst({
      where: { tenantId, email: input.email },
    });
    if (existingUser) {
      // Distinct codes let the client highlight the offending form field.
      throw new ConflictError('A user with this email already exists', 'EMAIL_EXISTS');
    }

    if (input.idNumber) {
      const existingIdNumber = await employeeRepository.findByIdNumber(input.idNumber, tenantId);
      if (existingIdNumber) {
        throw new ConflictError('An employee with this ID number already exists', 'ID_NUMBER_EXISTS');
      }
    }

    if (input.departmentId) {
      const department = await departmentRepository.findById(input.departmentId, tenantId);
      if (!department) {
        throw new BadRequestError('Department not found');
      }
    }

    if (input.positionId) {
      const position = await positionRepository.findById(input.positionId, tenantId);
      if (!position) {
        throw new BadRequestError('Position not found');
      }
    }

    if (input.managerId) {
      await validateManagerAssignment(tenantId, input.managerId, null);
    }

    // Probation must end on or after the join date. Create defaults joinDate to
    // today when omitted, so validate against that same effective date.
    if (input.probationEndDate) {
      const effectiveJoinDate = input.joinDate ? new Date(input.joinDate) : new Date();
      if (new Date(input.probationEndDate) < effectiveJoinDate) {
        throw new BadRequestError(
          'Probation end date cannot be earlier than join date',
          'PROBATION_BEFORE_JOIN',
        );
      }
    }

    // A manually supplied code must be unique within the tenant. When omitted
    // (internal callers only — the HTTP layer requires it) fall back to the
    // auto-generated EMP-NNN sequence.
    let employeeCode: string;
    if (input.employeeCode) {
      const existingCode = await employeeRepository.findByEmployeeCode(input.employeeCode, tenantId);
      if (existingCode) {
        throw new ConflictError(
          'An employee with this code already exists',
          'EMPLOYEE_CODE_EXISTS',
        );
      }
      employeeCode = input.employeeCode;
    } else {
      employeeCode = await generateEmployeeCode(tenantId);
    }
    const hashedPassword = await bcrypt.hash(input.password, 12);

    // Precedence: explicit roleId (system or custom) → legacy role enum → EMPLOYEE.
    let role: UserRole;
    let roleId: string;
    if (canAssignRole && input.roleId) {
      ({ roleId, role } = await resolveRoleAssignment(tenantId, input.roleId));
    } else {
      role = (canAssignRole ? input.role : undefined) || 'EMPLOYEE';
      roleId = await resolveRoleId(tenantId, role);
    }

    const employee = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: hashedPassword,
          fullName: input.fullName,
          role,
          roleId,
          status: 'ACTIVE',
          tenantId,
        },
      });

      return tx.employee.create({
        data: {
          employeeCode,
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          gender: input.gender,
          idNumber: input.idNumber,
          phone: input.phone,
          joinDate: input.joinDate ? new Date(input.joinDate) : new Date(),
          probationEndDate: input.probationEndDate ? new Date(input.probationEndDate) : undefined,
          contractType: input.contractType || 'FULL_TIME',
          dependentsCount: input.dependentsCount ?? 0,
          avatar: input.avatarUrl,
          status: 'ACTIVE',
          tenantId,
          userId: user.id,
          departmentId: input.departmentId,
          positionId: input.positionId,
          managerId: input.managerId,
          ...buildExtendedData(input, 'create'),
        },
        include: {
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true, level: true } },
          manager: { select: { id: true, fullName: true, employeeCode: true } },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              roleId: true,
              roleRef: { select: { name: true } },
              status: true,
            },
          },
        },
      });
    });

    // Best-effort: seed pro-rated first-year leave allocations after the employee
    // transaction commits. A failure here must never roll back a successful hire
    // (balances are recomputable), so it is logged and swallowed.
    try {
      await leaveAllocationService.seedProratedAllocations(tenantId, employee.id, employee.joinDate);
    } catch (err) {
      logger.error(
        { err, tenantId, employeeId: employee.id },
        'Failed to seed pro-rated leave allocations for new employee',
      );
    }

    return employee;
  },

  // See `create` for why role assignment is gated behind `canAssignRole`.
  async update(id: string, tenantId: string, input: UpdateEmployeeInput, canAssignRole = false) {
    const employee = await employeeRepository.findById(id, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (input.idNumber && input.idNumber !== employee.idNumber) {
      const existingIdNumber = await employeeRepository.findByIdNumber(input.idNumber, tenantId, id);
      if (existingIdNumber) {
        throw new ConflictError('An employee with this ID number already exists', 'ID_NUMBER_EXISTS');
      }
    }

    if (input.departmentId) {
      const department = await departmentRepository.findById(input.departmentId, tenantId);
      if (!department) {
        throw new BadRequestError('Department not found');
      }
    }

    if (input.positionId) {
      const position = await positionRepository.findById(input.positionId, tenantId);
      if (!position) {
        throw new BadRequestError('Position not found');
      }
    }

    if (input.managerId) {
      await validateManagerAssignment(tenantId, input.managerId, id);
    }

    // Probation must end on or after the (possibly updated) join date.
    if (input.probationEndDate) {
      const effectiveJoinDate = input.joinDate ? new Date(input.joinDate) : employee.joinDate;
      if (new Date(input.probationEndDate) < effectiveJoinDate) {
        throw new BadRequestError(
          'Probation end date cannot be earlier than join date',
          'PROBATION_BEFORE_JOIN',
        );
      }
    }

    // Precedence: explicit roleId (system or custom) → legacy role enum. When
    // neither is supplied the existing role is left untouched.
    let role: UserRole | undefined;
    let roleId: string | undefined;
    if (canAssignRole && input.roleId) {
      ({ roleId, role } = await resolveRoleAssignment(tenantId, input.roleId));
    } else if (canAssignRole && input.role) {
      role = input.role;
      roleId = await resolveRoleId(tenantId, role);
    }

    return db.$transaction(async (tx) => {
      if (input.fullName || role) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            fullName: input.fullName,
            role,
            roleId,
          },
        });
      }

      return tx.employee.update({
        where: { id, tenantId },
        data: {
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          gender: input.gender,
          idNumber: input.idNumber,
          phone: input.phone,
          joinDate: input.joinDate ? new Date(input.joinDate) : undefined,
          probationEndDate:
            input.probationEndDate === undefined
              ? undefined
              : input.probationEndDate
                ? new Date(input.probationEndDate)
                : null,
          contractType: input.contractType,
          dependentsCount: input.dependentsCount,
          avatar: input.avatarUrl,
          departmentId: input.departmentId === null ? null : input.departmentId,
          positionId: input.positionId === null ? null : input.positionId,
          managerId: input.managerId === null ? null : input.managerId,
          ...buildExtendedData(input, 'update'),
        },
        include: {
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true, level: true } },
          manager: { select: { id: true, fullName: true, employeeCode: true } },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              roleId: true,
              roleRef: { select: { name: true } },
              status: true,
            },
          },
        },
      });
    });
  },

  async activate(id: string, tenantId: string) {
    const employee = await employeeRepository.findById(id, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (employee.status === 'ACTIVE') {
      throw new BadRequestError('Employee is already active');
    }

    if (employee.status === 'TERMINATED') {
      throw new BadRequestError('Cannot activate a terminated employee');
    }

    return db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: employee.userId },
        data: { status: 'ACTIVE' },
      });

      return tx.employee.update({
        where: { id, tenantId },
        data: { status: 'ACTIVE' },
        include: {
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true, level: true } },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              roleId: true,
              roleRef: { select: { name: true } },
              status: true,
            },
          },
        },
      });
    });
  },

  async deactivate(id: string, tenantId: string) {
    const employee = await employeeRepository.findById(id, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (employee.status === 'INACTIVE') {
      throw new BadRequestError('Employee is already inactive');
    }

    if (employee.status === 'TERMINATED') {
      throw new BadRequestError('Cannot deactivate a terminated employee');
    }

    return db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: employee.userId },
        data: { status: 'INACTIVE' },
      });

      return tx.employee.update({
        where: { id, tenantId },
        data: { status: 'INACTIVE' },
        include: {
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true, level: true } },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              roleId: true,
              roleRef: { select: { name: true } },
              status: true,
            },
          },
        },
      });
    });
  },

  async terminate(id: string, tenantId: string, reason?: string | null) {
    return db.$transaction((tx) => employeeService.terminateWithinTx(tx, id, tenantId, reason));
  },

  // Terminate inside a caller-supplied transaction so consequences that must be
  // atomic with the termination (e.g. a probation FAIL decision) share one tx.
  // Single source of truth for the terminate invariant — public `terminate`
  // simply opens its own transaction around it.
  async terminateWithinTx(tx: Prisma.TransactionClient, id: string, tenantId: string, reason?: string | null) {
    const employee = await tx.employee.findFirst({ where: { id, tenantId } });
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (employee.status === 'TERMINATED') {
      throw new BadRequestError('Employee is already terminated');
    }

    await tx.user.update({
      where: { id: employee.userId },
      data: { status: 'INACTIVE' },
    });

    return tx.employee.update({
      where: { id, tenantId },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
        terminationReason: reason ?? undefined,
      },
      include: {
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true, level: true } },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            roleId: true,
            roleRef: { select: { name: true } },
            status: true,
          },
        },
      },
    });
  },
};
