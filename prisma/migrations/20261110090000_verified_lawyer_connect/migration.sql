-- Verified Lawyer Connect.
-- NOTE: `prisma migrate diff` also proposed dropping the two HNSW vector
-- indexes from 20260919180000_add_hnsw_vector_indexes, because Prisma's
-- schema cannot describe them. Those DROPs were removed by hand: the
-- indexes are required for fast RAG search. Keep them out if this file
-- is ever regenerated.

-- CreateEnum
CREATE TYPE "LawyerStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LawyerDocumentType" AS ENUM ('ENROLMENT_CERTIFICATE', 'PRACTICE_CERTIFICATE', 'PHOTO_ID', 'SELFIE_WITH_ID');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'CLOSED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LAWYER';

-- CreateTable
CREATE TABLE "LawyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "photoKey" TEXT,
    "barCouncil" TEXT NOT NULL,
    "enrolmentNumber" TEXT NOT NULL,
    "enrolmentYear" INTEGER NOT NULL,
    "aibeNumber" TEXT,
    "practiceAreas" TEXT[],
    "courts" TEXT[],
    "languages" TEXT[],
    "bio" TEXT,
    "officeAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "legalAidPanel" BOOLEAN NOT NULL DEFAULT false,
    "proBono" BOOLEAN NOT NULL DEFAULT false,
    "acceptingClients" BOOLEAN NOT NULL DEFAULT true,
    "status" "LawyerStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawyerDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "LawyerDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawyerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLocation" (
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "pincode" TEXT,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ConsultationRequest" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "lawyerProfileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'NORMAL',
    "summary" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseShare" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CaseShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_userId_key" ON "LawyerProfile"("userId");

-- CreateIndex
CREATE INDEX "LawyerProfile_status_idx" ON "LawyerProfile"("status");

-- CreateIndex
CREATE INDEX "LawyerProfile_latitude_longitude_idx" ON "LawyerProfile"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_barCouncil_enrolmentNumber_key" ON "LawyerProfile"("barCouncil", "enrolmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerDocument_profileId_type_key" ON "LawyerDocument"("profileId", "type");

-- CreateIndex
CREATE INDEX "ConsultationRequest_citizenId_status_idx" ON "ConsultationRequest"("citizenId", "status");

-- CreateIndex
CREATE INDEX "ConsultationRequest_lawyerProfileId_status_idx" ON "ConsultationRequest"("lawyerProfileId", "status");

-- CreateIndex
CREATE INDEX "ConsultationMessage_requestId_createdAt_idx" ON "ConsultationMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseShare_caseId_idx" ON "CaseShare"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseShare_requestId_caseId_key" ON "CaseShare"("requestId", "caseId");

-- AddForeignKey
ALTER TABLE "LawyerProfile" ADD CONSTRAINT "LawyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerProfile" ADD CONSTRAINT "LawyerProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerDocument" ADD CONSTRAINT "LawyerDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_lawyerProfileId_fkey" FOREIGN KEY ("lawyerProfileId") REFERENCES "LawyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationMessage" ADD CONSTRAINT "ConsultationMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ConsultationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationMessage" ADD CONSTRAINT "ConsultationMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseShare" ADD CONSTRAINT "CaseShare_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ConsultationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseShare" ADD CONSTRAINT "CaseShare_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

