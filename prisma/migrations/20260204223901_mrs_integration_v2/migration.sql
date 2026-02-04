-- CreateEnum
CREATE TYPE "mrs_system_type" AS ENUM ('openmrs', 'epic', 'cerner', 'athena', 'openemr');

-- AlterTable
ALTER TABLE "sync_state" ADD COLUMN     "backoff_until" TIMESTAMP(3),
ADD COLUMN     "rate_limit_remaining" INTEGER,
ADD COLUMN     "rate_limit_reset_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "mrs_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "system_type" "mrs_system_type" NOT NULL,
    "base_url" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "capabilities_override" JSONB,
    "last_health_check_at" TIMESTAMP(3),
    "is_healthy" BOOLEAN NOT NULL DEFAULT true,
    "avg_latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mrs_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mrs_config_tenant_id_key" ON "mrs_config"("tenant_id");
