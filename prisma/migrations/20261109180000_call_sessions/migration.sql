-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "callSid" TEXT,
    "phoneMasked" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'hi',
    "mode" TEXT NOT NULL DEFAULT 'case',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "smsStatus" TEXT,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_callSid_key" ON "CallSession"("callSid");

-- CreateIndex
CREATE INDEX "CallSession_userId_requestedAt_idx" ON "CallSession"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "CallSession_phoneHash_requestedAt_idx" ON "CallSession"("phoneHash", "requestedAt");

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
