-- ============================================================================
-- reset-prod.sql — Dọn dữ liệu seed/rác trên DB production HRM.
--
-- Cơ sở: introspect TRỰC TIẾP DB production (instance
--   gen-lang-client-0828439003:asia-southeast1:hrm-pg, db "hrm"), 53 bảng thật —
--   KHÔNG dựa vào schema.prisma của bất kỳ nhánh nào. Bao gồm cả 2 bảng chỉ có
--   trên production: import_job, import_staging.
--
-- GIỮ LẠI:
--   • tenants, tenant_domains
--   • roles, permissions, role_permissions      (RBAC)
--   • users  : chỉ admin@codecrush.asia
--   • employees: chỉ employee của admin
--   • _prisma_migrations                          (lịch sử migration — không đụng)
-- XOÁ: tất cả còn lại (nhân viên seed, phòng ban, chức vụ, chấm công, nghỉ phép,
--   lương, tài sản, tuyển dụng, thử việc, thông báo, và TẤT CẢ bảng cấu hình).
--
-- Thứ tự xoá: con → cha, tôn trọng các FK RESTRICT (jobs.created_by,
--   asset_assignments.assigned_by, interviews.created_by, scorecards.interviewer,
--   application_stage_history.changed_by, asset_categories←assets, leave_types←...).
--
-- Chạy (qua cloud-sql-proxy ở 127.0.0.1:5433):
--   PGPASSWORD=... psql -h 127.0.0.1 -p 5433 -U hrm_app -d hrm \
--     -v ON_ERROR_STOP=1 -f apps/api/prisma/reset-prod.sql
-- Toàn bộ nằm trong 1 transaction — lỗi giữa chừng sẽ ROLLBACK.
-- ============================================================================

\set ADMIN_EMAIL '''admin@codecrush.asia'''

BEGIN;

-- An toàn: dừng (rollback) nếu không tìm thấy đúng 1 admin để giữ.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users WHERE email = 'admin@codecrush.asia';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Mong đợi đúng 1 admin (admin@codecrush.asia) nhưng tìm thấy %, dừng.', n;
  END IF;
END $$;

-- 1) Recruitment / ATS (gồm 2 bảng production-only: import_staging, import_job)
DELETE FROM bulk_import_items;
DELETE FROM bulk_import_batches;
DELETE FROM import_staging;
DELETE FROM import_job;
DELETE FROM scorecards;
DELETE FROM interview_interviewers;
DELETE FROM interviews;
DELETE FROM application_activities;
DELETE FROM application_stage_history;
DELETE FROM applications;
DELETE FROM candidate_attachments;
DELETE FROM candidates;
DELETE FROM job_hiring_team;
DELETE FROM job_stages;
DELETE FROM jobs;

-- 2) Tài sản
DELETE FROM asset_maintenances;
DELETE FROM asset_assignments;
DELETE FROM assets;
DELETE FROM asset_categories;

-- 3) Lương
DELETE FROM payslips;
DELETE FROM payroll_runs;
DELETE FROM employee_salaries;
DELETE FROM payroll_settings;

-- 4) Thử việc
DELETE FROM probation_reviews;
DELETE FROM probation_guidelines;
DELETE FROM probation_criteria;

-- 5) Nghỉ phép
DELETE FROM leave_approvals;
DELETE FROM leave_requests;
DELETE FROM leave_balances;
DELETE FROM leave_types;

-- 6) Tăng ca
DELETE FROM overtime_approvals;
DELETE FROM overtime_requests;

-- 7) Luồng duyệt
DELETE FROM approval_steps;
DELETE FROM approval_flows;

-- 8) Chấm công
DELETE FROM attendance_records;
DELETE FROM holidays;
DELETE FROM timesheet_policies;

-- 9) Pipeline tuyển dụng (template)
DELETE FROM pipeline_template_stages;
DELETE FROM pipeline_templates;

-- 10) Khác
DELETE FROM contracts;
DELETE FROM notifications;
DELETE FROM settings_audit_logs;
DELETE FROM refresh_tokens;

-- 11) Người & cơ cấu tổ chức — giữ admin.
--     RESTRICT children của employees đã rỗng ở trên nên xoá được.
DELETE FROM employees
 WHERE user_id NOT IN (SELECT id FROM users WHERE email = 'admin@codecrush.asia');
DELETE FROM users
 WHERE email <> 'admin@codecrush.asia';

-- departments/positions: optional FK (SET NULL) trên employee của admin → chấp nhận.
DELETE FROM positions;
DELETE FROM departments;

-- Kiểm tra cuối: admin + tenant + RBAC còn nguyên trước khi commit.
DO $$
DECLARE u int; e int; t int; r int;
BEGIN
  SELECT count(*) INTO u FROM users;
  SELECT count(*) INTO e FROM employees;
  SELECT count(*) INTO t FROM tenants;
  SELECT count(*) INTO r FROM role_permissions;
  RAISE NOTICE 'Sau dọn: users=%, employees=%, tenants=%, role_permissions=%', u, e, t, r;
  IF u <> 1 OR t < 1 OR r = 0 THEN
    RAISE EXCEPTION 'Kết quả bất thường (users=%, tenants=%, role_permissions=%), rollback.', u, t, r;
  END IF;
END $$;

COMMIT;
