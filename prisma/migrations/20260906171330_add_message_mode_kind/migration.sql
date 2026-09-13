/*
  Warnings:

  - You are about to drop the `LegalDocument` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LegalDocument" DROP CONSTRAINT "LegalDocument_userId_fkey";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "mode" TEXT;

-- DropTable
DROP TABLE "LegalDocument";

-- DropEnum
DROP TYPE "AnalysisStatus";

-- DropEnum
DROP TYPE "LegalDocumentCategory";
