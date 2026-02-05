-- Scheduling Redesign Migration
-- This migration introduces datetime-based scheduling (no slot dependency)

-- Delete existing appointments (data will be re-synced)
DELETE FROM "appointments";

-- CreateEnum
CREATE TYPE "schedule_source" AS ENUM ('local', 'mrs_synced');

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_slot_id_fkey";

-- AlterTable - Add new columns and make slotId optional
ALTER TABLE "appointments" ADD COLUMN     "end_time" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "provider_id" TEXT,
ADD COLUMN     "service_id" TEXT,
ADD COLUMN     "start_time" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "slot_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "service_id" TEXT,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_duration_mins" INTEGER NOT NULL DEFAULT 30,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "source" "schedule_source" NOT NULL DEFAULT 'local',
    "mrs_service_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_templates_provider_id_day_of_week_idx" ON "schedule_templates"("provider_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_provider_id_service_id_day_of_week_effec_key" ON "schedule_templates"("provider_id", "service_id", "day_of_week", "effective_from");

-- CreateIndex
CREATE INDEX "appointments_provider_id_start_time_idx" ON "appointments"("provider_id", "start_time");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "appointment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "appointment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
