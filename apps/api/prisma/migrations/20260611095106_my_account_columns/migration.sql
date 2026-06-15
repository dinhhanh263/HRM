-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_linked_at" TIMESTAMP(3),
ADD COLUMN     "notification_prefs" JSONB;
