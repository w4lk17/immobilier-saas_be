/*
  Warnings:

  - Made the column `propertyId` on table `contracts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rentalId` on table `contracts` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_rentalId_fkey";

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "propertyId" SET NOT NULL,
ALTER COLUMN "rentalId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
