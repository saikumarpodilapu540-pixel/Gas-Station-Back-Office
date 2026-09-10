BEGIN;
-- Additive upgrade from Phase 3; preserves original files, receipts and stock history.
ALTER TABLE "purchases"
  ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "noReceiptReason" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "chargesExpenseId" TEXT;
ALTER TABLE "purchase_lines"
  ADD COLUMN "costBefore" DECIMAL(18,6),
  ADD COLUMN "versionAfter" INTEGER;
DROP INDEX "purchases_documentId_key";
DROP INDEX "purchases_vendorId_invoiceNumber_key";
CREATE UNIQUE INDEX "purchases_active_document_key" ON "purchases"("documentId") WHERE "status" = 'POSTED';
CREATE UNIQUE INDEX "purchases_active_invoice_key" ON "purchases"("vendorId", "invoiceNumber") WHERE "status" = 'POSTED';
CREATE INDEX "purchases_vendorId_invoiceNumber_idx" ON "purchases"("vendorId", "invoiceNumber");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_status_check" CHECK ("status" IN ('POSTED', 'VOIDED'));
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_source_check" CHECK ("source" IN ('INVOICE', 'MANUAL'));
COMMIT;
