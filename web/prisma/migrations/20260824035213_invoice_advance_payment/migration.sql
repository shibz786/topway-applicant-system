-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "advanceAmount" DECIMAL(65,30),
ADD COLUMN     "advanceStatus" TEXT NOT NULL DEFAULT 'NONE';
