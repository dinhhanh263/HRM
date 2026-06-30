-- DropForeignKey
ALTER TABLE "sales_email_messages" DROP CONSTRAINT "sales_email_messages_sent_by_id_fkey";

-- AlterTable
ALTER TABLE "sales_email_messages" ALTER COLUMN "sent_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sales_email_messages" ADD CONSTRAINT "sales_email_messages_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
