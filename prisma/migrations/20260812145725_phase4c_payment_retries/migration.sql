-- DropIndex
DROP INDEX "Payment_orderId_key";

-- AlterTable
ALTER TABLE "NotificationOutbox" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt" DESC);
