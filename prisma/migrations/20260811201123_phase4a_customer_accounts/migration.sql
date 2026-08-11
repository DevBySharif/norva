-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "country" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "recipientName" TEXT,
ALTER COLUMN "countryCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;
