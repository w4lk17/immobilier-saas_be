-- Rename employees table to managers
ALTER TABLE "employees" RENAME TO "managers";

-- Rename related constraints and indexes for consistency
ALTER INDEX "employees_pkey" RENAME TO "managers_pkey";
ALTER INDEX "employees_userId_key" RENAME TO "managers_userId_key";
ALTER TABLE "managers" RENAME CONSTRAINT "employees_userId_fkey" TO "managers_userId_fkey";

-- Rename foreign key constraints that target the managers table
ALTER TABLE "properties" RENAME CONSTRAINT "properties_managerId_fkey" TO "properties_managerId_fkey_old";
ALTER TABLE "contracts" RENAME CONSTRAINT "contracts_managerId_fkey" TO "contracts_managerId_fkey_old";

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "managers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "managers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "properties" DROP CONSTRAINT "properties_managerId_fkey_old";
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_managerId_fkey_old";
