-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "bank_account_number" TEXT,
ADD COLUMN     "bank_branch" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "current_address" TEXT,
ADD COLUMN     "education" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "emergency_contact_relationship" TEXT,
ADD COLUMN     "healthcare_facility" TEXT,
ADD COLUMN     "id_issue_date" TIMESTAMP(3),
ADD COLUMN     "id_issue_place" TEXT,
ADD COLUMN     "marital_status" "MaritalStatus",
ADD COLUMN     "motorbike_registration" TEXT,
ADD COLUMN     "permanent_address" TEXT,
ADD COLUMN     "personal_email" TEXT,
ADD COLUMN     "place_of_birth" TEXT,
ADD COLUMN     "social_insurance_number" TEXT,
ADD COLUMN     "tax_code" TEXT;
