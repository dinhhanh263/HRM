-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "union_fee_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "union_fee" DECIMAL(15,2) NOT NULL DEFAULT 0;
