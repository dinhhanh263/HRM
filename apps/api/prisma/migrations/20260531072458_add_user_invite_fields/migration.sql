-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'INVITED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invite_token" TEXT,
ADD COLUMN     "invite_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "password_set_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_invite_token_idx" ON "users"("invite_token");
