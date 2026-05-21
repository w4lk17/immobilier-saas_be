/*
  Warnings:

  - A unique constraint covering the columns `[reference]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contracts_reference_key" ON "contracts"("reference");
