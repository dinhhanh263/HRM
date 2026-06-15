-- CreateEnum
CREATE TYPE "OvertimeCategory" AS ENUM ('OT_WEEKDAY', 'OT_WEEKEND', 'OT_HOLIDAY');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('SELF', 'MANUAL_ADJUST');

-- CreateTable
CREATE TABLE "timesheet_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "standard_hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "night_start" TEXT NOT NULL DEFAULT '22:00',
    "night_end" TEXT NOT NULL DEFAULT '06:00',
    "ot_weekday" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "ot_weekend" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "ot_holiday" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "night_extra" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "night_ot_extra" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "note" TEXT,
    "worked_hours" DOUBLE PRECISION,
    "source" "AttendanceSource" NOT NULL DEFAULT 'SELF',
    "adjusted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "night" BOOLEAN NOT NULL DEFAULT false,
    "category" "OvertimeCategory" NOT NULL,
    "reason" TEXT,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "multiplier" DOUBLE PRECISION,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_policies_tenant_id_key" ON "timesheet_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "holidays_tenant_id_idx" ON "holidays"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_tenant_id_date_key" ON "holidays"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_employee_id_idx" ON "attendance_records"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "attendance_records_adjusted_by_id_idx" ON "attendance_records"("adjusted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_employee_id_work_date_key" ON "attendance_records"("tenant_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "overtime_requests_tenant_id_status_idx" ON "overtime_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_tenant_id_employee_id_idx" ON "overtime_requests"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "overtime_requests_reviewed_by_id_idx" ON "overtime_requests"("reviewed_by_id");

-- AddForeignKey
ALTER TABLE "timesheet_policies" ADD CONSTRAINT "timesheet_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_adjusted_by_id_fkey" FOREIGN KEY ("adjusted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
