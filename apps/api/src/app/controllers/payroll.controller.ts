import type { Request, Response } from 'express';
import { payrollSettingsService } from '../../domain/services/payroll-settings.service.js';
import { employeeSalaryService } from '../../domain/services/employee-salary.service.js';
import { payrollRunService } from '../../domain/services/payroll-run.service.js';
import { payslipService } from '../../domain/services/payroll-payslip.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { listPayrollRunsSchema, listPayslipsSchema } from '../validators/payroll.validator.js';
import { BadRequestError, ValidationError } from '../../shared/errors/index.js';

/** Whether the caller holds payroll:process (HR scope — may read any payslip). */
async function callerCanProcess(req: Request): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  if (!user.roleId) {
    return false;
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('payroll:process');
}

export const payrollController = {
  // ---- Settings ----

  async getSettings(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollSettingsService.getSettings(tenantId);

    res.json({ success: true, data });
  },

  async updateSettings(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollSettingsService.updateSettings(tenantId, req.body);

    res.json({ success: true, data });
  },

  // ---- Salaries (effective-dated) ----

  async listSalaryRoster(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await employeeSalaryService.listRoster(tenantId, {
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });

    res.json({ success: true, data });
  },

  async listEmployeeSalaries(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await employeeSalaryService.listForEmployee(tenantId, req.params.employeeId);

    res.json({ success: true, data });
  },

  async createSalary(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    // createdBy references an Employee; the actor may not be one (e.g. SUPER_ADMIN),
    // in which case the audit field is left null.
    const actor = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await employeeSalaryService.create(tenantId, req.body, actor?.id ?? null);

    res.status(201).json({ success: true, data });
  },

  async deleteSalary(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await employeeSalaryService.remove(tenantId, req.params.id);

    res.status(204).send();
  },

  // ---- Payroll runs ----

  async createRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    // runBy references an Employee; the actor may not be one (e.g. SUPER_ADMIN),
    // in which case the audit field is left null.
    const actor = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await payrollRunService.createRun(tenantId, req.body.period, actor?.id ?? null);

    res.status(201).json({ success: true, data });
  },

  async listRuns(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const parsed = listPayrollRunsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const query = parsed.data;
    const { rows, total } = await payrollRunService.list(tenantId, query);
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  },

  async getRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollRunService.getById(tenantId, req.params.id);

    res.json({ success: true, data });
  },

  async recomputeRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await payrollRunService.recompute(tenantId, req.params.id, actor?.id ?? null);

    res.json({ success: true, data });
  },

  async submitRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await payrollRunService.submit(tenantId, req.params.id, actor?.id ?? null);

    res.json({ success: true, data });
  },

  async approveRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const actor = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await payrollRunService.approve(tenantId, req.params.id, actor?.id ?? null);

    res.json({ success: true, data });
  },

  async rejectRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollRunService.reject(tenantId, req.params.id);

    res.json({ success: true, data });
  },

  async markRunPaid(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollRunService.markPaid(tenantId, req.params.id);

    res.json({ success: true, data });
  },

  async cancelRun(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const data = await payrollRunService.cancel(tenantId, req.params.id);

    res.json({ success: true, data });
  },

  // ---- Payslips (self-service; HR may read any) ----

  async listMyPayslips(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const self = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    if (!self) {
      throw new BadRequestError('No employee profile is linked to your account');
    }
    const parsed = listPayslipsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const query = parsed.data;
    const { rows, total } = await payslipService.listMine(tenantId, self.id, query);
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  },

  async getPayslip(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const [self, canProcess] = await Promise.all([
      employeeRepository.findByUserId(req.user!.sub, tenantId),
      callerCanProcess(req),
    ]);
    const data = await payslipService.getForViewer(tenantId, req.params.id, {
      employeeId: self?.id ?? null,
      canProcess,
    });

    res.json({ success: true, data });
  },

  async getPayslipPdf(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const [self, canProcess] = await Promise.all([
      employeeRepository.findByUserId(req.user!.sub, tenantId),
      callerCanProcess(req),
    ]);
    const { buffer, filename } = await payslipService.renderPdf(tenantId, req.params.id, {
      employeeId: self?.id ?? null,
      canProcess,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  // ---- Bulk run export (HR-only; payroll:export) ----

  async exportRunPdf(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { buffer, filename } = await payrollRunService.renderRunPdf(tenantId, req.params.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },
};
