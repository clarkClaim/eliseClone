-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "last_sync_error" TEXT,
ADD COLUMN     "sync_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "synced_to_mrs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "synced_to_mrs_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "patients_synced_to_mrs_idx" ON "patients"("synced_to_mrs");
