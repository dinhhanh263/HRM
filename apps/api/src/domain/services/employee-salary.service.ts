import {
  employeeSalaryRepository,
  type NewSalaryData,
} from '../repositories/employee-salary.repository.js';
import { toEmployeeSalaryDto } from '../payroll/mappers.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import type {
  AllowanceItem,
  CreateEmployeeSalaryRequest,
  EmployeeSalaryDto,
  SalaryListQuery,
  SalaryRosterEntryDto,
} from '@hrm/shared';

// A VND money string must parse to a finite, non-negative number.
function parseMoney(name: string, raw: string): void {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n) || n < 0) {
    throw new BadRequestError(`${name} must be a non-negative amount`);
  }
}

// Accepts a YYYY-MM-DD calendar date (anchored at UTC midnight) or any value
// Date can parse. Rejected at the boundary because it drives the whole history.
function parseEffectiveDate(raw: string): Date {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestError('effectiveFrom must be a valid date (YYYY-MM-DD)');
  }
  return d;
}

function dayBefore(d: Date): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() - 1);
  return r;
}

function validateAllowances(allowances: AllowanceItem[]): void {
  allowances.forEach((a) => {
    if (typeof a.name !== 'string' || a.name.trim() === '') {
      throw new BadRequestError('allowance name is required');
    }
    if (typeof a.amount !== 'number' || !Number.isFinite(a.amount) || a.amount < 0) {
      throw new BadRequestError('allowance amount must be a non-negative number');
    }
    if (typeof a.taxable !== 'boolean') {
      throw new BadRequestError('allowance taxable flag must be a boolean');
    }
  });
}

export const employeeSalaryService = {
  /** The salary sheet: every active employee with their salary in force today. */
  async listRoster(tenantId: string, query: SalaryListQuery): Promise<SalaryRosterEntryDto[]> {
    const asOf = new Date();
    const rows = await employeeSalaryRepository.listRoster(tenantId, asOf, {
      departmentId: query.departmentId,
      search: query.search,
    });
    return rows.map((e) => ({
      employee: {
        id: e.id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
        avatar: e.avatar,
        departmentName: e.department?.name ?? null,
      },
      salary: e.salaries[0] ? toEmployeeSalaryDto(e.salaries[0]) : null,
    }));
  },

  /** Full effective-dated history for one employee, newest first. */
  async listForEmployee(tenantId: string, employeeId: string): Promise<EmployeeSalaryDto[]> {
    const rows = await employeeSalaryRepository.findByEmployee(tenantId, employeeId);
    return rows.map(toEmployeeSalaryDto);
  },

  /** The salary in force on `asOf`, or null if the employee had none yet. */
  async getInForce(
    tenantId: string,
    employeeId: string,
    asOf: Date,
  ): Promise<EmployeeSalaryDto | null> {
    const row = await employeeSalaryRepository.findInForce(tenantId, employeeId, asOf);
    return row ? toEmployeeSalaryDto(row) : null;
  },

  /**
   * Append a new effective-dated salary. The new effectiveFrom must be strictly
   * after the current head of the history; the prior in-force record is closed
   * the day before so the timeline stays contiguous and non-overlapping.
   */
  async create(
    tenantId: string,
    input: CreateEmployeeSalaryRequest,
    createdById: string | null,
  ): Promise<EmployeeSalaryDto> {
    parseMoney('baseSalary', input.baseSalary);
    const allowances = input.allowances ?? [];
    validateAllowances(allowances);
    const newFrom = parseEffectiveDate(input.effectiveFrom);

    const latest = await employeeSalaryRepository.findLatest(tenantId, input.employeeId);
    if (latest && newFrom.getTime() <= latest.effectiveFrom.getTime()) {
      throw new BadRequestError('effectiveFrom must be after the current salary effective date');
    }

    const data: NewSalaryData = {
      tenantId,
      employeeId: input.employeeId,
      baseSalary: input.baseSalary,
      allowances,
      effectiveFrom: newFrom,
      note: input.note ?? null,
      createdById,
    };
    const priorClose = latest ? { id: latest.id, effectiveTo: dayBefore(newFrom) } : null;

    const created = await employeeSalaryRepository.createClosingPrior(data, priorClose);
    return toEmployeeSalaryDto(created);
  },

  /**
   * Undo the most recent salary entry, re-opening its predecessor. Only the head
   * of the history may be removed — older records are immutable audit trail.
   */
  async remove(tenantId: string, id: string): Promise<void> {
    const target = await employeeSalaryRepository.findById(tenantId, id);
    if (!target) {
      throw new NotFoundError('Salary record not found');
    }
    const history = await employeeSalaryRepository.findByEmployee(tenantId, target.employeeId);
    if (history[0]?.id !== id) {
      throw new BadRequestError('only the most recent salary record may be removed');
    }
    const priorId = history[1]?.id ?? null;
    await employeeSalaryRepository.deleteReopeningPrior(tenantId, id, priorId);
  },
};
