import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export interface EmployeeFilters {
  search?: string;
  departmentId?: string;
  positionId?: string;
  status?: string;
  contractType?: string;
  minLevel?: number;
  // Row-level access scope: restrict results to these employee ids. An empty
  // array means "no employees in scope" (returns nothing) — used to enforce
  // role-based visibility (e.g. a MANAGER sees only their team).
  ids?: string[];
  sort?: 'fullName' | 'joinDate' | 'employeeCode';
  order?: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export const employeeRepository = {
  async findAll(
    tenantId: string,
    filters: EmployeeFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ) {
    const where: Prisma.EmployeeWhereInput = { tenantId };

    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { employeeCode: { contains: filters.search, mode: 'insensitive' } },
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters.positionId) {
      where.positionId = filters.positionId;
    }

    if (filters.status) {
      where.status = filters.status as Prisma.EnumEmployeeStatusFilter['equals'];
    }

    if (filters.contractType) {
      where.contractType = filters.contractType as Prisma.EnumContractTypeFilter['equals'];
    }

    // Manager-eligibility filter: only employees whose position level meets the
    // threshold (e.g. Direct Manager dropdown asks for level >= MANAGER).
    if (filters.minLevel !== undefined) {
      where.position = { level: { gte: filters.minLevel } };
    }

    // Row-level access scope. An empty array means "nothing in scope" and must
    // return zero rows — Prisma's `{ id: { in: [] } }` does exactly that.
    if (filters.ids !== undefined) {
      where.id = { in: filters.ids };
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const orderBy: Prisma.EmployeeOrderByWithRelationInput = filters.sort
      ? { [filters.sort]: filters.order ?? 'asc' }
      : { createdAt: 'desc' };

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
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
        orderBy,
        skip,
        take: pagination.limit,
      }),
      db.employee.count({ where }),
    ]);

    return {
      data: employees,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  async findById(id: string, tenantId: string) {
    return db.employee.findFirst({
      where: { id, tenantId },
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
  },

  async findByUserId(userId: string, tenantId: string) {
    return db.employee.findFirst({ where: { userId, tenantId } });
  },

  /** Distinct ids from `ids` that exist within the tenant — used to validate that
   * a set of assigned employees (e.g. interviewers) all belong to this tenant. */
  async findExistingIds(ids: string[], tenantId: string): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db.employee.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /** Ids of the employees who report directly to `managerId` within the tenant. */
  async findReportIds(managerId: string, tenantId: string): Promise<string[]> {
    const rows = await db.employee.findMany({
      where: { managerId, tenantId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /** Lightweight lookup of an employee's direct manager id (cycle detection). */
  async findManagerId(id: string, tenantId: string): Promise<string | null> {
    const employee = await db.employee.findFirst({
      where: { id, tenantId },
      select: { managerId: true },
    });
    return employee?.managerId ?? null;
  },

  /**
   * The data the leave-approval routing engine needs about a requester: their
   * department, direct manager, and the head of their department.
   */
  async findRoutingContext(
    id: string,
    tenantId: string,
  ): Promise<{ departmentId: string | null; managerId: string | null; departmentHeadId: string | null } | null> {
    const employee = await db.employee.findFirst({
      where: { id, tenantId },
      select: {
        departmentId: true,
        managerId: true,
        department: { select: { managerId: true } },
      },
    });
    if (!employee) return null;
    return {
      departmentId: employee.departmentId,
      managerId: employee.managerId,
      departmentHeadId: employee.department?.managerId ?? null,
    };
  },

  async findByUserEmail(email: string, tenantId: string, excludeId?: string) {
    return db.employee.findFirst({
      where: {
        tenantId,
        user: { email },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  },

  /** SPEC-046: linked User ids for the given employees (every employee has one). */
  async findUserIdsByIds(tenantId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db.employee.findMany({
      where: { tenantId, id: { in: ids } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  async findByIdNumber(idNumber: string, tenantId: string, excludeId?: string) {
    return db.employee.findFirst({
      where: {
        idNumber,
        tenantId,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  },

  async findByEmployeeCode(employeeCode: string, tenantId: string, excludeId?: string) {
    return db.employee.findFirst({
      where: {
        employeeCode,
        tenantId,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  },

  async create(data: Prisma.EmployeeCreateInput) {
    return db.employee.create({
      data,
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
  },

  async update(id: string, tenantId: string, data: Prisma.EmployeeUpdateInput) {
    return db.employee.update({
      where: { id, tenantId },
      data,
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
  },

  async updateStatus(id: string, tenantId: string, status: string, terminatedAt?: Date) {
    return db.employee.update({
      where: { id, tenantId },
      data: {
        status: status as Prisma.EnumEmployeeStatusFieldUpdateOperationsInput['set'],
        ...(terminatedAt && { terminatedAt }),
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
  },

  async delete(id: string, tenantId: string) {
    return db.employee.delete({
      where: { id, tenantId },
    });
  },
};
