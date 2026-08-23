-- CreateEnum
CREATE TYPE "LegalDocumentCategory" AS ENUM ('LEGAL_NOTICE', 'FIR_POLICE_DOC', 'COURT_ORDER');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETE', 'DEGRADED');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "LegalDocumentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeKb" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "ocrText" TEXT NOT NULL,
    "ocrConfidence" INTEGER NOT NULL,
    "ocrConfidenceNote" TEXT,
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysisJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocument_userId_idx" ON "LegalDocument"("userId");

-- CreateIndex
CREATE INDEX "LegalDocument_analysisStatus_idx" ON "LegalDocument"("analysisStatus");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
