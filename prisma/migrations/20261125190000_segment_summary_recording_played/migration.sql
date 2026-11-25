-- AlterEnum
ALTER TYPE "Delivery" ADD VALUE 'RECORDING_PLAYED';

-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "summary" VARCHAR(300);
