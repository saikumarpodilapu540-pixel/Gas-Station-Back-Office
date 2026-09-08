import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint, keyOf, emitStore } from '../utils/http';
import { accessStore, audit, changeStock, D, fail, inventoryInclude, manager, operate, ownerFor, receiveCostedStock, stockItem, stockView } from '../services/operations';

const router = Router();
router.use(requireAuth);
const amount = z.number().finite().nonnegative().max(9999999);
const qty = z.number().int().min(0).max(100000000);
const signedQty = z.number().int().min(-100000000).max(100000000);
const createSchema = z.object({ storeId: z.string().uuid(), catalogId: z.string().uuid().optional(), productName: z.string().trim().min(1).max(150),
  sku: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(100), baseUnit: z.string().trim().min(1).max(30).default('each'),
  costPrice: amount, sellingPrice: amount, stockQuantity: qty, reorderLevel: qty.default(10), taxRate: z.number().min(0).max(1).default(0) });
const importSchema = createSchema.omit({ storeId: true, sku: true, costPrice: true, stockQuantity: true }).extend({
  sku: z.string().trim().min(1).max(100).optional(), costPrice: amount.default(0), stockQuantity: qty.default(0)
});
const normalized = (body: any) => ({ ...body, storeId: body.storeId ?? body.store_id, productName: body.productName ?? body.product_name,
  costPrice: body.costPrice ?? body.cost_price, sellingPrice: body.sellingPrice ?? body.selling_price,
  stockQuantity: body.stockQuantity ?? body.stock_quantity, reorderLevel: body.reorderLevel ?? body.reorder_level });

router.get('/catalog', endpoint(async (req, res) => {
  const ownerId = await ownerFor(prisma, actorOf(req));
  res.json(await prisma.product.findMany({ where: { ownerId }, include: { packages: true }, orderBy: { name: 'asc' } }));
}));
router.get('/movements', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId);
  await accessStore(prisma, actorOf(req), storeId);
  const take = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.take);
  res.json(await prisma.stockMovement.findMany({ where: { storeId, ...(req.query.inventoryId ? { inventoryId: String(req.query.inventoryId) } : {}) },
    include: { inventory: { select: { productName: true, sku: true } }, package: true, operation: { select: { actorId: true } } }, orderBy: { createdAt: 'desc' }, take }));
}));
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId);
  await accessStore(prisma, actorOf(req), storeId);
  const rows = await prisma.inventory.findMany({ where: { storeId, ...(req.query.archived === 'true' ? {} : { archivedAt: null }),
    ...(req.query.category ? { category: String(req.query.category) } : {}),
    ...(req.query.search ? { OR: [{ productName: { contains: String(req.query.search), mode: 'insensitive' as const } }, { sku: { contains: String(req.query.search), mode: 'insensitive' as const } }] } : {}) },
    include: inventoryInclude, orderBy: { productName: 'asc' } });
  res.json(rows.map(stockView).filter(i => req.query.stock === 'low' ? i.availableQuantity <= i.reorderLevel : req.query.stock === 'out' ? i.availableQuantity === 0 : true));
}));
router.get('/:id', endpoint(async (req, res) => {
  res.json(stockView(await stockItem(prisma, actorOf(req), String(req.params.id))));
}));

async function createItem(tx: any, op: any, data: z.infer<typeof createSchema>) {
  manager(op.actor);
  await accessStore(tx, op.actor, data.storeId);
  let catalog = data.catalogId ? await tx.product.findUnique({ where: { id: data.catalogId } }) : await tx.product.findUnique({ where: { ownerId_sku: { ownerId: op.ownerId, sku: data.sku } } });
  if (catalog && catalog.ownerId !== op.ownerId) fail('Catalog access denied.', 403);
  if (!catalog) catalog = await tx.product.create({ data: { ownerId: op.ownerId, sku: data.sku, name: data.productName, category: data.category, baseUnit: data.baseUnit,
    packages: { create: { name: 'Each', unitsPerPackage: 1 } } } });
  const item = await tx.inventory.create({ data: { storeId: data.storeId, catalogId: catalog.id, productName: catalog.name, category: catalog.category, sku: catalog.sku,
    costPrice: data.costPrice, sellingPrice: data.sellingPrice, reorderLevel: data.reorderLevel, taxRate: data.taxRate } });
  const each = await tx.productPackage.findFirstOrThrow({ where: { productId: catalog.id, unitsPerPackage: 1 } });
  await changeStock(tx, op, { inventoryId: item.id, packageId: each.id, location: 'BACKROOM', quantity: data.stockQuantity,
    kind: 'OPENING', reason: 'Opening stock entered when adding this store product.' });
  await audit(tx, op, item.storeId, 'Added store product', { inventoryId: item.id, quantity: data.stockQuantity });
  return tx.inventory.findUniqueOrThrow({ where: { id: item.id }, include: inventoryInclude });
}
router.post('/', endpoint(async (req, res) => {
  const data = createSchema.parse({ ...normalized(req.body), sku: req.body.sku || `SKU-${randomUUID().slice(0, 8).toUpperCase()}` });
  const result = await operate(actorOf(req), keyOf(req), { action: 'create-product', data }, (tx, op) => createItem(tx, op, data));
  emitStore(req, data.storeId); res.status(201).json(result);
}));
router.post('/import-csv', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.body.storeId);
  const rawItems = z.array(importSchema).min(1).max(200).parse(req.body.items);
  const items = rawItems.map((item, index) => ({ ...item, sku: item.sku || `IMP-${Date.now().toString(36).toUpperCase()}-${index + 1}` }));
  const result = await operate(actorOf(req), keyOf(req), { action: 'catalog-import', storeId, items }, async (tx, op) => {
    for (const item of items) await createItem(tx, op, { ...item, storeId });
    return { count: items.length, message: `Imported ${items.length} products.` };
  }); emitStore(req, storeId); res.status(201).json(result);
}));
router.put('/:id', endpoint(async (req, res) => {
  const id = String(req.params.id);
  const data = createSchema.omit({ storeId: true, catalogId: true, baseUnit: true, stockQuantity: true }).partial().extend({ expectedVersion: z.number().int().min(0) }).parse(normalized(req.body));
  if (req.body.stockQuantity !== undefined || req.body.stock_quantity !== undefined) fail('Use the physical count action to change stock.');
  const result = await operate(actorOf(req), keyOf(req), { action: 'edit-product', id, data }, async (tx, op) => {
    manager(op.actor); const item = await stockItem(tx, op.actor, id);
    if (item.version !== data.expectedVersion) fail('Stock changed since this form opened. Refresh before saving.', 409);
    if (data.costPrice !== undefined && !D(data.costPrice).equals(item.costPrice) && item.stockQuantity > 0) fail('Cost is calculated from receipts. Receive stock or perform a documented stock valuation adjustment.');
    const shared = (data.productName && data.productName !== item.productName) || (data.sku && data.sku !== item.sku) || (data.category && data.category !== item.category);
    if (shared) {
      if (op.actor.role !== 'OWNER') fail('Only the owner can change shared product details.', 403);
      await tx.product.update({ where: { id: item.catalogId }, data: { name: data.productName, sku: data.sku, category: data.category } });
      await tx.inventory.updateMany({ where: { catalogId: item.catalogId }, data: { productName: data.productName, sku: data.sku, category: data.category, version: { increment: 1 } } });
    }
    const { expectedVersion: _, ...updates } = data;
    await tx.inventory.update({ where: { id }, data: { ...updates, version: { increment: 1 } } });
    await audit(tx, op, item.storeId, 'Edited product settings', { id, before: item, changes: updates });
    return tx.inventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude });
  }); emitStore(req, result.storeId); res.json(result);
}));
router.delete('/:id', endpoint(async (req, res) => {
  const id = String(req.params.id);
  const result = await operate(actorOf(req), keyOf(req), { action: 'archive-product', id }, async (tx, op) => {
    manager(op.actor); const item = await stockItem(tx, op.actor, id);
    if (item.stockQuantity || item.balances.some(b => b.reserved)) fail('Move or reconcile the remaining stock before archiving.', 409);
    const pending = await tx.stockTransferLine.count({ where: { productId: item.catalogId, transfer: { OR: [{ sourceStoreId: item.storeId }, { destinationStoreId: item.storeId }], status: { in: ['DRAFT', 'RESERVED', 'DISPATCHED', 'PARTIAL'] } } } });
    if (pending) fail('Resolve open transfers before archiving this product.', 409);
    await tx.inventory.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, op, item.storeId, 'Archived product', { id }); return { success: true, storeId: item.storeId };
  }); emitStore(req, result.storeId); res.json(result);
}));
router.post('/:id/restore', endpoint(async (req, res) => {
  const id = String(req.params.id);
  const result = await operate(actorOf(req), keyOf(req), { action: 'restore-product', id }, async (tx, op) => {
    manager(op.actor); const item = await tx.inventory.findUniqueOrThrow({ where: { id } }); await accessStore(tx, op.actor, item.storeId);
    await tx.inventory.update({ where: { id }, data: { archivedAt: null } }); await audit(tx, op, item.storeId, 'Restored product', { id }); return item;
  }); emitStore(req, result.storeId); res.json(result);
}));
router.post('/:id/packages', endpoint(async (req, res) => {
  const id = String(req.params.id);
  const data = z.object({ name: z.string().trim().min(1).max(50), unitsPerPackage: z.number().int().min(2).max(10000), barcode: z.string().trim().min(1).max(100).optional() }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'add-package', id, data }, async (tx, op) => {
    manager(op.actor); const item = await stockItem(tx, op.actor, id);
    if (data.barcode && await tx.productPackage.findFirst({ where: { barcode: data.barcode, product: { ownerId: op.ownerId } } })) fail('This barcode already belongs to a package.', 409);
    const pack = await tx.productPackage.create({ data: { ...data, productId: item.catalogId } });
    await audit(tx, op, item.storeId, 'Defined packaging', pack); return { ...pack, storeId: item.storeId };
  }); emitStore(req, result.storeId); res.status(201).json(result);
}));
const movementSchema = z.object({ kind: z.enum(['RECEIVE', 'COUNT', 'MOVE', 'CONVERT', 'ADJUST', 'PRICE']), packageId: z.string().uuid(), location: z.enum(['BACKROOM', 'SHELF']),
  quantity: signedQty, toPackageId: z.string().uuid().optional(), toLocation: z.enum(['BACKROOM', 'SHELF']).optional(), expectedVersion: z.number().int().nonnegative().optional(),
  unitCost: amount.optional(), sellingPrice: amount.optional(), reason: z.string().trim().min(3).max(500) });
router.post('/:id/stock', endpoint(async (req, res) => {
  const id = String(req.params.id); const data = movementSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'stock', id, data }, async (tx, op) => {
    manager(op.actor); const item = await stockItem(tx, op.actor, id);
    const pack = item.catalog.packages.find(p => p.id === data.packageId); if (!pack) return fail('Select packaging for this product.');
    const common = { inventoryId: id, packageId: pack.id, location: data.location, kind: data.kind, reason: data.reason };
    if (data.kind === 'COUNT') {
      if (data.expectedVersion === undefined || data.expectedVersion !== item.version) fail('Stock changed since the count began. Refresh and recount.', 409);
      if (data.quantity < 0) fail('A physical count cannot be negative.');
      const current = item.balances.find(b => b.packageId === pack.id && b.location === data.location)?.quantity || 0;
      await changeStock(tx, op, { ...common, quantity: data.quantity - current });
    } else if (data.kind === 'RECEIVE') {
      if (data.unitCost === undefined || data.quantity < 1) fail('A positive quantity and cost per package are required.');
      await receiveCostedStock(tx, op, { ...common, quantity: data.quantity, unitCost: D(data.unitCost!).div(pack.unitsPerPackage) });
    } else if (data.kind === 'ADJUST') {
      if (data.quantity === 0) fail('Enter a non-zero stock adjustment.');
      await changeStock(tx, op, { ...common, quantity: data.quantity });
    } else if (data.kind === 'PRICE') {
      if (data.sellingPrice === undefined) fail('Package selling price is required.');
      await tx.stockBalance.upsert({ where: { inventoryId_packageId_location: { inventoryId: id, packageId: pack.id, location: data.location } },
        create: { inventoryId: id, packageId: pack.id, location: data.location, sellingPrice: data.sellingPrice }, update: { sellingPrice: data.sellingPrice } });
    } else {
      if (data.quantity < 1 || !data.toLocation) fail('A positive quantity and destination location are required.');
      const target = data.kind === 'MOVE' ? pack : item.catalog.packages.find(p => p.id === data.toPackageId);
      if (!target) return fail('Select destination packaging.');
      const converted = data.quantity * pack.unitsPerPackage / target.unitsPerPackage;
      if (!Number.isInteger(converted)) fail('The quantity must convert into whole destination packs.');
      if (pack.id === target.id && data.location === data.toLocation) fail('Choose different packaging or a different location.');
      await changeStock(tx, op, { ...common, quantity: -data.quantity });
      await changeStock(tx, op, { ...common, packageId: target.id, location: data.toLocation!, quantity: converted });
    }
    await audit(tx, op, item.storeId, `Stock ${data.kind.toLowerCase()}`, { inventoryId: id, ...data });
    return tx.inventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude });
  }); emitStore(req, result.storeId); res.json(stockView(result));
}));
export default router;
