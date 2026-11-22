-- CreateEnum
CREATE TYPE "TriState" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateTable
CREATE TABLE "CustodyTracker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "personName" TEXT NOT NULL,
    "relationship" TEXT,
    "policeStation" TEXT,
    "firNumber" TEXT,
    "courtName" TEXT,
    "prisonName" TEXT,
    "arrestDate" DATE NOT NULL,
    "firstRemandDate" DATE,
    "sections" TEXT[],
    "otherLawCharges" BOOLEAN NOT NULL DEFAULT false,
    "chargesheetFiledOn" DATE,
    "priorConviction" "TriState" NOT NULL DEFAULT 'UNKNOWN',
    "otherPendingCases" "TriState" NOT NULL DEFAULT 'UNKNOWN',
    "inCustody" BOOLEAN NOT NULL DEFAULT true,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodyTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustodyTracker_userId_idx" ON "CustodyTracker"("userId");

-- CreateIndex
CREATE INDEX "CustodyTracker_caseId_idx" ON "CustodyTracker"("caseId");

-- CreateIndex
CREATE INDEX "CustodyTracker_remindersEnabled_inCustody_idx" ON "CustodyTracker"("remindersEnabled", "inCustody");

-- AddForeignKey
ALTER TABLE "CustodyTracker" ADD CONSTRAINT "CustodyTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTracker" ADD CONSTRAINT "CustodyTracker_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

