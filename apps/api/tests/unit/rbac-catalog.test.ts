import { describe, it, expect } from 'vitest';
import { PERMISSION_KEYS } from '@hrm/shared';
import { SYSTEM_ROLES } from '../../src/domain/rbac/catalog.js';

/** Helper: explicit permission list for a system role key. */
function permsFor(roleKey: string): string[] {
  const def = SYSTEM_ROLES.find((r) => r.key === roleKey);
  if (!def) throw new Error(`role ${roleKey} not found`);
  return def.permissions === '*' ? PERMISSION_KEYS : def.permissions;
}

describe('RBAC catalog — employees:import grant matrix', () => {
  it('registers employees:import in the global permission catalog', () => {
    expect(PERMISSION_KEYS).toContain('employees:import');
  });

  it('grants employees:import to HR Manager', () => {
    expect(permsFor('hr_manager')).toContain('employees:import');
  });

  it('grants employees:import to Super Admin (wildcard)', () => {
    const superAdmin = SYSTEM_ROLES.find((r) => r.key === 'super_admin');
    expect(superAdmin?.permissions).toBe('*');
    expect(permsFor('super_admin')).toContain('employees:import');
  });

  it('does NOT grant employees:import to Manager or Employee', () => {
    expect(permsFor('manager')).not.toContain('employees:import');
    expect(permsFor('employee')).not.toContain('employees:import');
  });
});

describe('RBAC catalog — payroll:approve maker-checker matrix', () => {
  it('registers payroll:approve in the global permission catalog', () => {
    expect(PERMISSION_KEYS).toContain('payroll:approve');
  });

  it('keeps payroll:process and payroll:export on HR Manager but NOT payroll:approve', () => {
    const hr = permsFor('hr_manager');
    expect(hr).toContain('payroll:process');
    expect(hr).toContain('payroll:export');
    expect(hr).not.toContain('payroll:approve');
  });

  it('grants payroll:approve + payroll:view to the Payroll Approver role, not payroll:process', () => {
    const approver = permsFor('payroll_approver');
    expect(approver).toContain('payroll:approve');
    expect(approver).toContain('payroll:view');
    expect(approver).not.toContain('payroll:process');
  });

  it('grants payroll:approve to Super Admin (wildcard)', () => {
    expect(permsFor('super_admin')).toContain('payroll:approve');
  });

  it('does NOT grant payroll:approve to Manager or Employee', () => {
    expect(permsFor('manager')).not.toContain('payroll:approve');
    expect(permsFor('employee')).not.toContain('payroll:approve');
  });
});

describe('RBAC catalog — recruitment / ATS grant matrix (SPEC-024)', () => {
  const ALL_RECRUITMENT = [
    'recruitment:job_view', 'recruitment:job_create', 'recruitment:job_update',
    'recruitment:candidate_view', 'recruitment:candidate_create', 'recruitment:candidate_update',
    'recruitment:application_view', 'recruitment:application_create',
    'recruitment:application_move', 'recruitment:application_reject',
    'recruitment:application_hire', 'recruitment:application_withdraw',
    'recruitment:interview_schedule',
    'recruitment:scorecard_submit',
  ];

  it('registers all 14 recruitment permission keys in the global catalog', () => {
    for (const key of ALL_RECRUITMENT) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('grants every recruitment permission to HR Manager', () => {
    const hr = permsFor('hr_manager');
    for (const key of ALL_RECRUITMENT) {
      expect(hr).toContain(key);
    }
  });

  it('grants every recruitment permission to Super Admin (wildcard)', () => {
    const su = permsFor('super_admin');
    for (const key of ALL_RECRUITMENT) {
      expect(su).toContain(key);
    }
  });

  it('grants Manager the operational subset but not create/update/reject of candidates', () => {
    const mgr = permsFor('manager');
    expect(mgr).toContain('recruitment:job_view');
    expect(mgr).toContain('recruitment:candidate_view');
    expect(mgr).toContain('recruitment:application_view');
    expect(mgr).toContain('recruitment:application_move');
    expect(mgr).toContain('recruitment:interview_schedule');
    expect(mgr).toContain('recruitment:scorecard_submit');
    expect(mgr).not.toContain('recruitment:job_create');
    expect(mgr).not.toContain('recruitment:candidate_create');
    expect(mgr).not.toContain('recruitment:application_reject');
    expect(mgr).not.toContain('recruitment:application_hire');
    expect(mgr).not.toContain('recruitment:application_withdraw');
  });

  it('grants Employee scorecard_submit but NOT candidate_view (unscoped PII leak)', () => {
    const emp = permsFor('employee');
    expect(emp).toContain('recruitment:scorecard_submit');
    // candidate_view is unscoped (no hiring-team filter in the service), so an
    // EMPLOYEE must not hold it — otherwise all staff could browse candidate PII.
    expect(emp).not.toContain('recruitment:candidate_view');
    expect(emp).not.toContain('recruitment:job_view');
    expect(emp).not.toContain('recruitment:application_move');
    expect(emp).not.toContain('recruitment:candidate_create');
  });
});

// SPEC-033: probation:self — ai cũng có thể là người thử việc (kể cả manager/HR),
// nên mọi system role đều được tự đánh giá; ownership check nằm ở controller.
describe('RBAC catalog — probation:self grant matrix (SPEC-033)', () => {
  it('registers probation:self in the global permission catalog', () => {
    expect(PERMISSION_KEYS).toContain('probation:self');
  });

  it('grants probation:self to every system role', () => {
    // Duyệt catalog thật — thêm role mới mà quên grant sẽ fail ngay tại đây.
    for (const role of SYSTEM_ROLES) {
      expect(permsFor(role.key), `role ${role.key}`).toContain('probation:self');
    }
  });

  it('still does NOT grant probation:view to Employee (no cross-review visibility)', () => {
    expect(permsFor('employee')).not.toContain('probation:view');
  });
});
