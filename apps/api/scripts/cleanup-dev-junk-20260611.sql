-- One-off cleanup (2026-06-11): integration/E2E runs that pointed at hrm_dev
-- left probation-test employees in the codecrush tenant (full_name like
-- "Tự ĐG <timestamp>", "Khung ĐG <timestamp>", "Thử Việc <timestamp>"),
-- flooding the dashboard's "Sự kiện sắp tới" widget with onboarding events.
--
-- Every deleted row is first copied into the cleanup_backup schema, so this
-- is reversible with INSERT INTO <table> SELECT * FROM cleanup_backup.<copy>.
-- Drop the schema once the cleanup is confirmed good:
--   DROP SCHEMA cleanup_backup CASCADE;
--
-- Run: docker exec -i hrm-postgres psql -U hrm -d hrm_dev < scripts/cleanup-dev-junk-20260611.sql
\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS cleanup_backup;

CREATE TEMP TABLE junk_employees ON COMMIT DROP AS
SELECT e.id AS employee_id, e.user_id
FROM employees e
WHERE e.tenant_id = 'cmpqfpnr90000o10b9mbn0ljb' -- tenant codecrush
  AND e.full_name ~ '(Tự ĐG|Khung ĐG|Thử Việc|Khung đánh giá) [0-9]{13,}';

\echo '=== Employees to be deleted ==='
SELECT e.full_name, e.employee_code, e.join_date::date, u.email
FROM employees e
JOIN users u ON u.id = e.user_id
WHERE e.id IN (SELECT employee_id FROM junk_employees)
ORDER BY e.created_at;

-- Backups (full rows, table per entity, dated suffix)
CREATE TABLE cleanup_backup.employees_20260611 AS
  SELECT * FROM employees WHERE id IN (SELECT employee_id FROM junk_employees);
CREATE TABLE cleanup_backup.users_20260611 AS
  SELECT * FROM users WHERE id IN (SELECT user_id FROM junk_employees);
CREATE TABLE cleanup_backup.probation_reviews_20260611 AS
  SELECT * FROM probation_reviews WHERE employee_id IN (SELECT employee_id FROM junk_employees);
CREATE TABLE cleanup_backup.contracts_20260611 AS
  SELECT * FROM contracts WHERE employee_id IN (SELECT employee_id FROM junk_employees);
CREATE TABLE cleanup_backup.leave_requests_20260611 AS
  SELECT * FROM leave_requests WHERE employee_id IN (SELECT employee_id FROM junk_employees);
CREATE TABLE cleanup_backup.leave_balances_20260611 AS
  SELECT * FROM leave_balances WHERE employee_id IN (SELECT employee_id FROM junk_employees);
CREATE TABLE cleanup_backup.refresh_tokens_20260611 AS
  SELECT * FROM refresh_tokens WHERE user_id IN (SELECT user_id FROM junk_employees);
CREATE TABLE cleanup_backup.notifications_20260611 AS
  SELECT * FROM notifications WHERE user_id IN (SELECT user_id FROM junk_employees);

\echo '=== Backup row counts ==='
SELECT 'employees' AS t, count(*) FROM cleanup_backup.employees_20260611
UNION ALL SELECT 'users', count(*) FROM cleanup_backup.users_20260611
UNION ALL SELECT 'probation_reviews', count(*) FROM cleanup_backup.probation_reviews_20260611
UNION ALL SELECT 'contracts', count(*) FROM cleanup_backup.contracts_20260611
UNION ALL SELECT 'leave_requests', count(*) FROM cleanup_backup.leave_requests_20260611
UNION ALL SELECT 'leave_balances', count(*) FROM cleanup_backup.leave_balances_20260611
UNION ALL SELECT 'refresh_tokens', count(*) FROM cleanup_backup.refresh_tokens_20260611
UNION ALL SELECT 'notifications', count(*) FROM cleanup_backup.notifications_20260611;

\echo '=== Deleting (children first, users last) ==='
DELETE FROM probation_reviews WHERE employee_id IN (SELECT employee_id FROM junk_employees);
DELETE FROM contracts          WHERE employee_id IN (SELECT employee_id FROM junk_employees);
DELETE FROM leave_requests     WHERE employee_id IN (SELECT employee_id FROM junk_employees);
DELETE FROM leave_balances     WHERE employee_id IN (SELECT employee_id FROM junk_employees);
DELETE FROM notifications      WHERE user_id     IN (SELECT user_id     FROM junk_employees);
DELETE FROM refresh_tokens     WHERE user_id     IN (SELECT user_id     FROM junk_employees);
DELETE FROM employees          WHERE id          IN (SELECT employee_id FROM junk_employees);
DELETE FROM users              WHERE id          IN (SELECT user_id     FROM junk_employees);

\echo '=== Remaining junk after delete (must be 0) ==='
SELECT count(*) AS remaining
FROM employees
WHERE tenant_id = 'cmpqfpnr90000o10b9mbn0ljb'
  AND full_name ~ '(Tự ĐG|Khung ĐG|Thử Việc|Khung đánh giá) [0-9]{13,}';

COMMIT;
