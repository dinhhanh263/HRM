-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceBase" AS ENUM ('GROSS', 'BASE_SALARY');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "dependents_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "pay_day" INTEGER NOT NULL DEFAULT 5,
    "social_insurance_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "health_insurance_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.015,
    "unemployment_insurance_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "insurance_base" "InsuranceBase" NOT NULL DEFAULT 'BASE_SALARY',
    "insurance_cap" DECIMAL(15,2),
    "personal_deduction" DECIMAL(15,2) NOT NULL DEFAULT 11000000,
    "dependent_deduction" DECIMAL(15,2) NOT NULL DEFAULT 4400000,
    "tax_brackets" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "settings_snapshot" JSONB,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "run_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "dependents" INTEGER NOT NULL DEFAULT 0,
    "working_days" INTEGER NOT NULL,
    "days_present" INTEGER NOT NULL,
    "paid_leave_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaid_leave_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "days_absent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holiday_count" INTEGER NOT NULL DEFAULT 0,
    "overtime" JSONB NOT NULL DEFAULT '[]',
    "prorated_base" DECIMAL(15,2) NOT NULL,
    "allowance_total" DECIMAL(15,2) NOT NULL,
    "ot_pay" DECIMAL(15,2) NOT NULL,
    "gross_pay" DECIMAL(15,2) NOT NULL,
    "social_insurance" DECIMAL(15,2) NOT NULL,
    "health_insurance" DECIMAL(15,2) NOT NULL,
    "unemployment_insurance" DECIMAL(15,2) NOT NULL,
    "insurance_total" DECIMAL(15,2) NOT NULL,
    "taxable_income" DECIMAL(15,2) NOT NULL,
    "personal_income_tax" DECIMAL(15,2) NOT NULL,
    "other_deductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_tenant_id_key" ON "payroll_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "employee_salaries_tenant_id_employee_id_effective_from_idx" ON "employee_salaries"("tenant_id", "employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_salaries_employee_id_idx" ON "employee_salaries"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_runs_tenant_id_status_idx" ON "payroll_runs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_period_key" ON "payroll_runs"("tenant_id", "period");

-- CreateIndex
CREATE INDEX "payslips_tenant_id_employee_id_idx" ON "payslips"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payroll_run_id_employee_id_key" ON "payslips"("payroll_run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
