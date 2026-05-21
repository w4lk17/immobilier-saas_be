/*
  Warnings:

  - You are about to drop the column `readAt` on the `notifications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "chargesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "rentDeposit" SET DEFAULT 1,
ALTER COLUMN "rentAdvance" SET DEFAULT 0,
ALTER COLUMN "paymentStartAfter" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "readAt";
