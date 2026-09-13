-- AlterTable
ALTER TABLE "FIRDraft" ADD COLUMN     "caseState" JSONB,
ADD COLUMN     "draftText" TEXT,
ADD COLUMN     "draftVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';
