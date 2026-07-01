-- CreateTable
CREATE TABLE "approval_watchers" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "watcher_type" "ApproverType" NOT NULL,
    "role_key" TEXT,
    "watcher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_watchers_flow_id_idx" ON "approval_watchers"("flow_id");

-- AddForeignKey
ALTER TABLE "approval_watchers" ADD CONSTRAINT "approval_watchers_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_watchers" ADD CONSTRAINT "approval_watchers_watcher_id_fkey" FOREIGN KEY ("watcher_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
