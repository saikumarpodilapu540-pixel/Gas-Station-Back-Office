BEGIN;
-- DropIndex
DROP INDEX "inventory_sku_key";

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "legalEntity" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Chicago';

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "catalogId" TEXT,
ADD COLUMN     "taxRate" DECIMAL(7,6) NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "category" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "packageName" TEXT NOT NULL DEFAULT 'Each',
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitsPerPackage" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "fuel_logs" ADD COLUMN     "costPerGallon" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "daily_closings" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "costOfGoodsSold" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "taxCollected" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "extraCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL DEFAULT 'each',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_packages" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitsPerPackage" INTEGER NOT NULL,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'BACKROOM',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(12,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_operations" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "baseUnits" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "totalCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "sourceInventoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sourceLocation" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "unitsPerPackage" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "returnedAfterReceipt" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_receipts" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "checkNumber" TEXT NOT NULL,
    "checkDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_allocations" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "settlement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "extraction" JSONB,
    "error" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "supplierDescription" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "unitsPerPackage" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "lineCost" DECIMAL(18,6) NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_item_mappings" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,

    CONSTRAINT "supplier_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_ownerId_sku_key" ON "products"("ownerId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_packages_productId_name_key" ON "product_packages"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_packages_productId_barcode_key" ON "product_packages"("productId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_inventoryId_packageId_location_key" ON "stock_balances"("inventoryId", "packageId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "stock_operations_ownerId_key_key" ON "stock_operations"("ownerId", "key");

-- CreateIndex
CREATE INDEX "stock_movements_storeId_createdAt_idx" ON "stock_movements"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_inventoryId_createdAt_idx" ON "stock_movements"("inventoryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_number_key" ON "stock_transfers"("number");

-- CreateIndex
CREATE INDEX "stock_transfers_ownerId_createdAt_idx" ON "stock_transfers"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfers_sourceStoreId_destinationStoreId_idx" ON "stock_transfers"("sourceStoreId", "destinationStoreId");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_transferId_idx" ON "stock_transfer_lines"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_ownerId_fromStoreId_checkNumber_key" ON "settlements"("ownerId", "fromStoreId", "checkNumber");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_allocations_settlementId_transferId_key" ON "settlement_allocations"("settlementId", "transferId");

-- CreateIndex
CREATE INDEX "invoice_documents_storeId_createdAt_idx" ON "invoice_documents"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_documents_ownerId_sha256_key" ON "invoice_documents"("ownerId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_item_mappings_vendorId_description_key" ON "supplier_item_mappings"("vendorId", "description");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_storeId_sku_key" ON "inventory"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_storeId_catalogId_key" ON "inventory"("storeId", "catalogId");

-- CreateIndex
CREATE INDEX "vendors_ownerId_idx" ON "vendors"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_documentId_key" ON "purchases"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_vendorId_invoiceNumber_key" ON "purchases"("vendorId", "invoiceNumber");

-- Preserve existing rows and establish an explicit opening stock ledger.
INSERT INTO products (id, "ownerId", sku, name, category)
SELECT i.id, s."ownerId", i.sku, i."productName", i.category FROM inventory i JOIN stores s ON s.id=i."storeId";
UPDATE inventory SET "catalogId"=id;
INSERT INTO product_packages (id, "productId", name, "unitsPerPackage")
SELECT md5(id || ':each')::uuid::text, id, 'Each', 1 FROM products;
INSERT INTO stock_balances (id, "inventoryId", "packageId", location, quantity, reserved, "updatedAt")
SELECT md5(i.id || ':opening-balance')::uuid::text, i.id, p.id, 'BACKROOM', i."stockQuantity", 0, CURRENT_TIMESTAMP
FROM inventory i JOIN product_packages p ON p."productId"=i."catalogId" AND p."unitsPerPackage"=1;
INSERT INTO stock_operations (id, "ownerId", "actorId", key, "requestHash", result)
SELECT md5(i.id || ':opening-operation')::uuid::text, s."ownerId", s."ownerId", 'migration-opening:' || i.id, 'phase3-migration', '{}'::jsonb
FROM inventory i JOIN stores s ON s.id=i."storeId";
INSERT INTO stock_movements (id, "operationId", "storeId", "inventoryId", "packageId", location, kind, quantity, "baseUnits", "unitCost", reason)
SELECT md5(i.id || ':opening-movement')::uuid::text, md5(i.id || ':opening-operation')::uuid::text,
i."storeId", i.id, p.id, 'BACKROOM', 'OPENING', i."stockQuantity", i."stockQuantity", i."costPrice", 'Phase 3 opening balance; verify physical packaging before converting.'
FROM inventory i JOIN product_packages p ON p."productId"=i."catalogId" AND p."unitsPerPackage"=1;
ALTER TABLE inventory ALTER COLUMN "catalogId" SET NOT NULL;
UPDATE sales SET subtotal="totalAmount";
UPDATE sale_items si SET category=i.category FROM inventory i WHERE i.id=si."productId";
UPDATE purchases SET subtotal="totalCost";
-- A vendor with purchases from exactly one owner can be assigned unambiguously.
UPDATE vendors v SET "ownerId"=x.owner_id FROM (
  SELECT p."vendorId", min(s."ownerId") AS owner_id FROM purchases p JOIN stores s ON s.id=p."storeId"
  GROUP BY p."vendorId" HAVING count(DISTINCT s."ownerId")=1
) x WHERE x."vendorId"=v.id;
-- Fresh single-owner installations can safely retain their unassigned vendor list.
UPDATE vendors SET "ownerId"=(SELECT min("ownerId") FROM stores)
WHERE "ownerId" IS NULL AND (SELECT count(DISTINCT "ownerId") FROM stores)=1;
-- Ambiguous legacy vendors remain preserved and unassigned. Upgrade preflight lists them.

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "invoice_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "product_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "stock_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "product_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database checks defend the inventory invariants even outside the API.
ALTER TABLE inventory ADD CONSTRAINT inventory_nonnegative CHECK ("stockQuantity">=0 AND "costPrice">=0 AND "sellingPrice">=0 AND "taxRate" BETWEEN 0 AND 1);
ALTER TABLE product_packages ADD CONSTRAINT package_units_positive CHECK ("unitsPerPackage">0);
ALTER TABLE stock_balances ADD CONSTRAINT balance_nonnegative CHECK (quantity>=0 AND reserved>=0 AND reserved<=quantity);
ALTER TABLE stock_balances ADD CONSTRAINT balance_location CHECK (location IN ('BACKROOM','SHELF'));
ALTER TABLE stock_transfer_lines ADD CONSTRAINT transfer_line_counts CHECK (quantity>0 AND received>=0 AND returned>=0 AND damaged>=0 AND received+returned+damaged<=quantity AND "returnedAfterReceipt">=0 AND "returnedAfterReceipt"<=received);
ALTER TABLE stock_transfers ADD CONSTRAINT transfer_distinct_stores CHECK ("sourceStoreId"<>"destinationStoreId");
ALTER TABLE stock_transfers ADD CONSTRAINT transfer_status CHECK (status IN ('DRAFT','RESERVED','DISPATCHED','PARTIAL','RECEIVED','CANCELLED','RETURNED'));
ALTER TABLE settlements ADD CONSTRAINT settlement_positive CHECK (amount>0 AND "fromStoreId"<>"toStoreId");
ALTER TABLE settlements ADD CONSTRAINT settlement_status CHECK (status IN ('ISSUED','DEPOSITED','CLEARED','VOIDED','BOUNCED'));
ALTER TABLE settlement_allocations ADD CONSTRAINT allocation_positive CHECK (amount>0);
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_line_positive CHECK (quantity>0 AND "unitsPerPackage">0 AND "unitCost">=0);
ALTER TABLE products ADD CONSTRAINT products_owner_fk FOREIGN KEY ("ownerId") REFERENCES users(id);
ALTER TABLE vendors ADD CONSTRAINT vendors_owner_fk FOREIGN KEY ("ownerId") REFERENCES users(id);
ALTER TABLE stock_transfers ADD CONSTRAINT transfers_source_fk FOREIGN KEY ("sourceStoreId") REFERENCES stores(id);
ALTER TABLE stock_transfers ADD CONSTRAINT transfers_destination_fk FOREIGN KEY ("destinationStoreId") REFERENCES stores(id);
ALTER TABLE stock_transfer_lines ADD CONSTRAINT transfers_inventory_fk FOREIGN KEY ("sourceInventoryId") REFERENCES inventory(id);
ALTER TABLE stock_transfer_lines ADD CONSTRAINT transfers_package_fk FOREIGN KEY ("packageId") REFERENCES product_packages(id);
ALTER TABLE settlements ADD CONSTRAINT settlements_from_fk FOREIGN KEY ("fromStoreId") REFERENCES stores(id);
ALTER TABLE settlements ADD CONSTRAINT settlements_to_fk FOREIGN KEY ("toStoreId") REFERENCES stores(id);
ALTER TABLE invoice_documents ADD CONSTRAINT invoices_store_fk FOREIGN KEY ("storeId") REFERENCES stores(id);
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_inventory_fk FOREIGN KEY ("inventoryId") REFERENCES inventory(id);
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_package_fk FOREIGN KEY ("packageId") REFERENCES product_packages(id);

ALTER TABLE invoice_documents ADD COLUMN "reviewDraft" JSONB;
ALTER TABLE purchase_lines ADD COLUMN "landedUnitCost" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN "chargesTreatment" TEXT NOT NULL DEFAULT 'CAPITALIZE';
COMMIT;
