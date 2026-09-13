/*
  Warnings:

  - You are about to drop the `LegalDocument` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LegalDocument" DROP CONSTRAINT IF EXISTS "LegalDocument_userId_fkey";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "kind" TEXT,
ADD COLUMN IF NOT EXISTS "mode" TEXT;

-- DropTable
DROP TABLE IF EXISTS "LegalDocument";

-- DropEnum
DROP TYPE IF EXISTS "AnalysisStatus";

-- DropEnum
DROP TYPE IF EXISTS "LegalDocumentCategory";
