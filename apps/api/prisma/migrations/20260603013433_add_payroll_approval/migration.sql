-- AlterEnum
ALTER TYPE "PayrollRunStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PAYROLL_APPROVER';

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "submitted_by_id" TEXT;
