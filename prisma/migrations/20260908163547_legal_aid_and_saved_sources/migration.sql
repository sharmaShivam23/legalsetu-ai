/*
  Warnings:

  - Added the required column `userId` to the `LawyerReferral` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "LawyerReferral" DROP CONSTRAINT "LawyerReferral_caseId_fkey";

-- AlterTable
ALTER TABLE "LawyerReferral" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "status" "ReferralStatus" NOT NULL DEFAULT 'SUBMITTED',
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "caseId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LegalAidResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "phone" TEXT,
    "description" TEXT NOT NULL,
    "website" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAidResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalSourceId" TEXT NOT NULL,
    "section" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAidResource_category_idx" ON "LegalAidResource"("category");

-- CreateIndex
CREATE INDEX "SavedSource_userId_idx" ON "SavedSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedSource_userId_legalSourceId_section_key" ON "SavedSource"("userId", "legalSourceId", "section");

-- CreateIndex
CREATE INDEX "LawyerReferral_userId_idx" ON "LawyerReferral"("userId");

-- AddForeignKey
ALTER TABLE "LawyerReferral" ADD CONSTRAINT "LawyerReferral_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerReferral" ADD CONSTRAINT "LawyerReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSource" ADD CONSTRAINT "SavedSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSource" ADD CONSTRAINT "SavedSource_legalSourceId_fkey" FOREIGN KEY ("legalSourceId") REFERENCES "LegalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
