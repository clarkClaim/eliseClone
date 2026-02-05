-- AlterTable
ALTER TABLE "appointment_types" ALTER COLUMN "mrs_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "mrs_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "mrs_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "mrs_id" DROP NOT NULL;
