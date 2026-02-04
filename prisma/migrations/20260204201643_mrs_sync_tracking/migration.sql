-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "last_sync_error" TEXT,
ADD COLUMN     "mrs_updated_at" TIMESTAMP(3),
ADD COLUMN     "sync_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "synced_to_mrs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "synced_to_mrs_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "availability" ADD COLUMN     "mrs_exists" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mrs_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "backoff_exponent" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_retry_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sync_state" ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_sync_duration" INTEGER,
ADD COLUMN     "next_sync_at" TIMESTAMP(3),
ADD COLUMN     "records_processed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "mrs_id" TEXT,
    "conflict_type" TEXT NOT NULL,
    "local_state" JSONB NOT NULL,
    "mrs_state" JSONB,
    "resolution" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_conflicts_entity_type_entity_id_idx" ON "sync_conflicts"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_conflict_type_idx" ON "sync_conflicts"("conflict_type");

-- CreateIndex
CREATE INDEX "appointments_synced_to_mrs_idx" ON "appointments"("synced_to_mrs");
