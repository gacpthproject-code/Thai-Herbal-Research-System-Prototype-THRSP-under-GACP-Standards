ALTER TABLE "harvest_batches" ADD COLUMN     "backdatedCertificateId" TEXT;
CREATE INDEX "harvest_batches_backdatedCertificateId_idx" ON "harvest_batches"("backdatedCertificateId");
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_backdatedCertificateId_fkey" FOREIGN KEY ("backdatedCertificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

