-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDue" TIMESTAMP(3);
