import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

// Include used when a record needs to carry employee identity (reviewer views).
export const attendanceWithEmployee = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      avatar: true,
      department: { select: { name: true } },
    },
  },
  adjustedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AttendanceRecordInclude;

export const attendanceRepository = {
  async findByEmployeeAndDate(tenantId: string, employeeId: string, workDate: Date) {
    return db.attendanceRecord.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
    });
  },

  async findByEmployeeAndRange(tenantId: string, employeeId: string, start: Date, end: Date) {
    return db.attendanceRecord.findMany({
      where: { tenantId, employeeId, workDate: { gte: start, lt: end } },
      orderBy: { workDate: 'asc' },
    });
  },

  // Reviewer scope: when employeeIds is null the query is tenant-wide (HR);
  // otherwise it is restricted to the reviewer's direct reports (manager).
  async findForReview(
    tenantId: string,
    employeeIds: string[] | null,
    start: Date,
    end: Date,
  ) {
    return db.attendanceRecord.findMany({
      where: {
        tenantId,
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
        workDate: { gte: start, lt: end },
      },
      include: attendanceWithEmployee,
      orderBy: [{ workDate: 'desc' }, { employee: { fullName: 'asc' } }],
    });
  },

  async create(data: Prisma.AttendanceRecordCreateInput) {
    return db.attendanceRecord.create({ data });
  },

  async update(id: string, data: Prisma.AttendanceRecordUpdateInput) {
    return db.attendanceRecord.update({ where: { id }, data });
  },
};
