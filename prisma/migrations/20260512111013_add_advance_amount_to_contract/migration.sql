-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "advanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "depositAmount" SET DEFAULT 0;
