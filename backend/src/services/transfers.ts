import { randomUUID } from 'crypto';
import { z } from 'zod';
import { accessStore, audit, changeStock, D, ensureStoreInventory, fail, manager, money, Operation, receiveCostedStock, stockItem, Tx } from './operations';
export const transferInclude = { lines: true, receipts: { orderBy: { createdAt: 'desc' as const } }, allocations: { include: { settlement: true } } } as const;
export const createTransferSchema = z.object({ sourceStoreId: z.string().uuid(), destinationStoreId: z.string().uuid(), notes: z.string().trim().max(1000).default(''),
  lines: z.array(z.object({ inventoryId: z.string().uuid(), packageId: z.string().uuid(), location: z.enum(['BACKROOM','SHELF']), quantity: z.number().int().positive().max(100000) })).min(1).max(100) });
export async function createTransfer(tx: Tx, op: Operation, data: z.infer<typeof createTransferSchema>) {
  manager(op.actor); const source = await accessStore(tx, op.actor, data.sourceStoreId);
  const destination = await tx.store.findUnique({ where: { id: data.destinationStoreId } });
  if (!destination || destination.ownerId !== source.ownerId || source.id === destination.id) fail('Choose two different stores belonging to the same owner.');
  const lines = [];
  const seen = new Set();
  for (const line of data.lines) {
    const item = await stockItem(tx, op.actor, line.inventoryId);
    if (item.storeId !== source.id) fail('A transfer item belongs to a different source store.');
    const pack = item.catalog.packages.find(p => p.id === line.packageId);
    if (!pack) return fail('Packaging does not belong to this product.');
    const identity = `${item.id}:${pack.id}:${line.location}`;
    if (seen.has(identity)) fail('Combine duplicate product/package/location lines.');
    seen.add(identity);
    lines.push({ sourceInventoryId: item.id, productId: item.catalogId, packageId: pack.id, sourceLocation: line.location,
      productName: item.productName, sku: item.sku, packageName: pack.name, unitsPerPackage: pack.unitsPerPackage,
      quantity: line.quantity, unitCost: item.costPrice, sellingPrice: item.sellingPrice });
  }
  const transfer = await tx.stockTransfer.create({ data: { ownerId: op.ownerId, number: `TR-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomUUID().slice(0,8).toUpperCase()}`,
    sourceStoreId: source.id, destinationStoreId: destination!.id, notes: data.notes, createdById: op.actor.id,
    totalCost: lines.reduce((sum, l) => sum.plus(D(l.unitCost).mul(l.quantity * l.unitsPerPackage)), D(0)), lines: { create: lines } }, include: transferInclude });
  await audit(tx, op, source.id, 'Created transfer draft', { transferId: transfer.id, number: transfer.number }, 'Transfers');
  return transfer;
}
export async function getTransfer(tx: Tx, op: Pick<Operation,'actor'|'ownerId'>, id: string) {
  const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: transferInclude });
  if (!transfer || transfer.ownerId !== op.ownerId) return fail('Transfer not found.', 404);
  if (op.actor.role !== 'OWNER' && ![transfer.sourceStoreId, transfer.destinationStoreId].includes(op.actor.storeId || '')) fail('Transfer access denied.', 403);
  return transfer;
}
export function transferMoney(t: any) {
  const credit = t.lines.reduce((sum: any, l: any) => sum.plus(D(l.unitCost).mul((l.returned + l.returnedAfterReceipt + l.damaged) * l.unitsPerPackage)), D(0));
  const amountDue = money(D(t.totalCost).minus(credit));
  const paid = t.allocations.filter((a: any) => a.settlement.status === 'CLEARED').reduce((sum: any, a: any) => sum.plus(a.amount), D(0));
  const pending = t.allocations.filter((a: any) => ['ISSUED','DEPOSITED'].includes(a.settlement.status)).reduce((sum: any, a: any) => sum.plus(a.amount), D(0));
  return { ...t, originalCost: money(t.totalCost), credit: money(credit), amountDue,
    clearedAmount: money(paid), pendingAmount: money(pending), outstanding: money(amountDue.minus(paid)),
    unallocated: money(amountDue.minus(paid).minus(pending)) };
}
export async function transitionTransfer(tx: Tx, op: Operation, id: string, action: string) {
  manager(op.actor); const t = await getTransfer(tx, op, id);
  await accessStore(tx, op.actor, t.sourceStoreId);
  if (action === 'reserve') {
    if (t.status !== 'DRAFT') fail('Only a draft can be reserved.', 409);
    for (const line of t.lines) await changeStock(tx, op, { inventoryId: line.sourceInventoryId, packageId: line.packageId, location: line.sourceLocation,
      quantity: 0, reservedDelta: line.quantity, kind: 'RESERVE', reason: 'Transfer approved', reference: t.number });
    await tx.stockTransfer.update({ where: { id }, data: { status: 'RESERVED' } });
  } else if (action === 'dispatch') {
    if (t.status !== 'RESERVED') fail('Reserve the transfer before dispatching.', 409);
    let totalCost = D(0);
    for (const line of t.lines) {
      const item = await stockItem(tx, op.actor, line.sourceInventoryId);
      totalCost = totalCost.plus(D(item.costPrice).mul(line.quantity * line.unitsPerPackage));
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { unitCost: item.costPrice } });
      await changeStock(tx, op, { inventoryId: item.id, packageId: line.packageId, location: line.sourceLocation, quantity: -line.quantity,
        reservedDelta: -line.quantity, kind: 'DISPATCH', reason: 'Dispatched to destination store', reference: t.number });
    }
    await tx.stockTransfer.update({ where: { id }, data: { status: 'DISPATCHED', dispatchedAt: new Date(), totalCost } });
  } else if (action === 'cancel') {
    if (!['DRAFT','RESERVED'].includes(t.status)) fail('Dispatched stock must be received, returned, or recorded as damaged.', 409);
    if (t.status === 'RESERVED') for (const line of t.lines) await changeStock(tx, op, { inventoryId: line.sourceInventoryId, packageId: line.packageId,
      location: line.sourceLocation, quantity: 0, reservedDelta: -line.quantity, kind: 'RELEASE', reason: 'Transfer cancelled', reference: t.number });
    await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
  } else fail('Unknown transfer action.');
  await audit(tx, op, t.sourceStoreId, `Transfer ${action}`, { transferId: id, number: t.number }, 'Transfers');
  return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
}
export const receiptSchema = z.object({ kind: z.enum(['RECEIVE','RETURN_IN_TRANSIT','RETURN_RECEIVED','DAMAGE']),
  location: z.enum(['BACKROOM','SHELF']).default('BACKROOM'), notes: z.string().trim().min(3).max(1000),
  lines: z.array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().positive().max(100000) })).min(1).max(100) });
export async function postReceipt(tx: Tx, op: Operation, id: string, data: z.infer<typeof receiptSchema>) {
  manager(op.actor); const t = await getTransfer(tx, op, id);
  if (!['DISPATCHED','PARTIAL','RECEIVED'].includes(t.status)) fail('This transfer has no stock to receive or return.', 409);
  const receiving = data.kind === 'RECEIVE' || data.kind === 'RETURN_RECEIVED';
  await accessStore(tx, op.actor, receiving ? t.destinationStoreId : t.sourceStoreId);
  if (data.kind === 'DAMAGE' && op.actor.role !== 'OWNER') fail('Only the owner can approve transit damage credits.', 403);
  const seen = new Set();
  for (const entry of data.lines) {
    if (seen.has(entry.lineId)) fail('Combine duplicate receipt lines.'); seen.add(entry.lineId);
    const line = t.lines.find(l => l.id === entry.lineId); if (!line) return fail('Receipt line does not belong to this transfer.');
    const remaining = data.kind === 'RETURN_RECEIVED' ? line.received - line.returnedAfterReceipt : line.quantity - line.received - line.returned - line.damaged;
    if (entry.quantity > remaining) fail('Receipt quantity exceeds the remaining quantity.', 409);
    const common = { packageId: line.packageId, quantity: entry.quantity, reason: data.notes, reference: t.number, kind: data.kind, unitCost: line.unitCost };
    if (data.kind === 'RECEIVE') {
      const destinationItem = await ensureStoreInventory(tx, line.productId, t.destinationStoreId, { costPrice: line.unitCost, sellingPrice: line.sellingPrice });
      await receiveCostedStock(tx, op, { ...common, inventoryId: destinationItem.id, location: data.location });
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { received: { increment: entry.quantity } } });
    } else if (data.kind === 'RETURN_IN_TRANSIT') {
      await receiveCostedStock(tx, op, { ...common, inventoryId: line.sourceInventoryId, location: data.location });
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { returned: { increment: entry.quantity } } });
    } else if (data.kind === 'RETURN_RECEIVED') {
      const destinationItem = await tx.inventory.findUniqueOrThrow({ where: { storeId_catalogId: { storeId: t.destinationStoreId, catalogId: line.productId } } });
      // Move inventory at B's current carrying cost. Settlement credits use the original transfer cost.
      await changeStock(tx, op, { ...common, inventoryId: destinationItem.id, location: data.location, quantity: -entry.quantity, unitCost: destinationItem.costPrice });
      await receiveCostedStock(tx, op, { ...common, inventoryId: line.sourceInventoryId, location: line.sourceLocation, unitCost: destinationItem.costPrice });
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { returnedAfterReceipt: { increment: entry.quantity } } });
    } else {
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { damaged: { increment: entry.quantity } } });
    }
  }
  await tx.transferReceipt.create({ data: { transferId: id, actorId: op.actor.id, kind: data.kind, notes: data.notes, details: data.lines } });
  const lines = await tx.stockTransferLine.findMany({ where: { transferId: id } });
  const completed = lines.every(l => l.quantity === l.received + l.returned + l.damaged);
  const returnedAll = completed && lines.every(l => l.received === l.returnedAfterReceipt);
  await tx.stockTransfer.update({ where: { id }, data: { status: returnedAll ? 'RETURNED' : completed ? 'RECEIVED' : 'PARTIAL', ...(completed ? { receivedAt: new Date() } : {}) } });
  await audit(tx, op, receiving ? t.destinationStoreId : t.sourceStoreId, `Transfer ${data.kind.toLowerCase()}`, { transferId: id, ...data }, 'Transfers');
  return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
}
