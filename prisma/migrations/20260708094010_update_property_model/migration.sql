-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "city" TEXT,
ADD COLUMN     "isForSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landTitle" TEXT,
ADD COLUMN     "lot" INTEGER,
ADD COLUMN     "nLot" INTEGER,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "surface" DOUBLE PRECISION,
ALTER COLUMN "propertyValue" DROP NOT NULL;
