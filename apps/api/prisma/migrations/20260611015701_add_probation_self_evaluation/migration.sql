-- AlterTable
ALTER TABLE "probation_reviews" ADD COLUMN     "self_comment" TEXT,
ADD COLUMN     "self_ratings" JSONB,
ADD COLUMN     "self_submitted_at" TIMESTAMP(3);
