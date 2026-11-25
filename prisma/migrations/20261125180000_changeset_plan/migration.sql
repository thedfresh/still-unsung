-- AlterTable
ALTER TABLE "changesets" ADD COLUMN     "plan" JSONB,
ADD COLUMN     "previewExpiresAt" TIMESTAMP(3);
