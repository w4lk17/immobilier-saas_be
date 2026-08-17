/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,reference]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "contracts_reference_key";

-- CreateIndex
CREATE UNIQUE INDEX "contracts_organizationId_reference_key" ON "contracts"("organizationId", "reference");
