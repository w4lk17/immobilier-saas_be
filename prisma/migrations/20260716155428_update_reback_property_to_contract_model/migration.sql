/*
  Warnings:

  - You are about to drop the column `address` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `designation` on the `contracts` table. All the data in the column will be lost.
  - Made the column `propertyId` on table `expenses` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_propertyId_fkey";

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "address",
DROP COLUMN "designation";

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "propertyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
