-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "idNumber" TEXT;

-- CreateIndex
CREATE INDEX "Candidate_passportNumber_idx" ON "Candidate"("passportNumber");

-- CreateIndex
CREATE INDEX "Candidate_idNumber_idx" ON "Candidate"("idNumber");
