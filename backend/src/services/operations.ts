import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLog } from '../utils/audit';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (message: string, status = 400): never => { throw new AppError(status, message); };
export const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
export const money = (value: Prisma.Decimal.Value) => D(value).toDecimalPlaces(2);
export type Tx = Prisma.TransactionClient;
export type Actor = { id: string; role: string; storeId: string | null };
export type Operation = { id: string; actor: Actor; ownerId: string };

export async function accessStore(tx: Tx, actor: Actor, id: string) {
  const store = await tx.store.findUnique({ where: { id } });
  if (!store || (store.ownerId !== actor.id && actor.storeId !== id)) fail('Store access denied.', 403);
  return store!;
}
export async function ownerFor(tx: Tx, actor: Actor) {
  if (actor.role === 'OWNER') return actor.id;
  if (!actor.storeId) return fail('Assign this user to a store first.', 403);
  return (await accessStore(tx, actor, actor.storeId)).ownerId;
}
export const manager = (actor: Actor) => {
  if (!['OWNER', 'MANAGER'].includes(actor.role)) fail('Owner or manager access is required.', 403);
};

// All stock/settlement writes share one serializable transaction boundary.
// Retry the WHOLE operation; database uniqueness makes retries and double clicks safe.
export async function operate<T>(actor: Actor, key: string, request: unknown,
  action: (tx: Tx, op: Operation) => Promise<T>): Promise<T> {
  if (!key || key.length < 8 || key.length > 128) fail('A request key (8–128 characters) is required.');
  const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const current = await tx.user.findUnique({ where: { id: actor.id } });
        if (!current) fail('User no longer exists.', 401);
        const freshActor: Actor = { id: current!.id, role: current!.role, storeId: current!.storeId };
        const ownerId = await ownerFor(tx, freshActor);
        const existing = await tx.stockOperation.findUnique({ where: { ownerId_key: { ownerId, key } } });
        if (existing) {
          if (existing.actorId !== actor.id || existing.requestHash !== requestHash) fail('This request key was already used for a different request.', 409);
          return existing.result as T;
        }
        const operation = await tx.stockOperation.create({ data: { ownerId, actorId: actor.id, key, requestHash } });
        const result = await action(tx, { id: operation.id, actor: freshActor, ownerId });
        await tx.stockOperation.update({ where: { id: operation.id }, data: { result: JSON.parse(JSON.stringify(result)) } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error: any) {
      if (attempt < 3 && ['P2034', 'P2002'].includes(error.code)) continue;
      throw error;
    }
  }
  throw new AppError(409, 'Another operation changed these records. Refresh and retry.');
}

export async function audit(tx: Tx, op: Operation, storeId: string, action: string, details: unknown, module = 'Stock') {
  await writeAuditLog(tx, { storeId, userId: op.actor.id, action, module, newValue: JSON.stringify(details) });
}

export const inventoryInclude = {
  catalog: { include: { packages: { orderBy: { unitsPerPackage: 'asc' as const } } } },
  balances: { include: { package: true }, orderBy: { location: 'asc' as const } }
} as const;

export async function stockItem(tx: Tx, actor: Actor, id: string) {
  const item = await tx.inventory.findUnique({ where: { id }, include: inventoryInclude });
  if (!item) return fail('Product not found.', 404);
  await accessStore(tx, actor, item.storeId);
  if (item.archivedAt) fail('This product is archived.');
  return item;
}

export function stockView(item: any) {
  const reserved = item.balances.reduce((sum: number, b: any) => sum + b.reserved * b.package.unitsPerPackage, 0);
  return { ...item, reservedQuantity: reserved, availableQuantity: item.stockQuantity - reserved };
}

type Change = { inventoryId: string; packageId: string; location: string; quantity: number;
  reservedDelta?: number; kind: string; reason: string; reference?: string; unitCost?: Prisma.Decimal.Value };

export async function changeStock(tx: Tx, op: Operation, c: Change) {
  if (!['BACKROOM', 'SHELF'].includes(c.location) || !Number.isSafeInteger(c.quantity)) fail('Invalid stock quantity or location.');
  const item = await tx.inventory.findUnique({ where: { id: c.inventoryId } });
  if (!item || item.archivedAt) return fail('Product is not available.', 404);
  const store = await tx.store.findUnique({ where: { id: item.storeId } });
  if (store?.ownerId !== op.ownerId) fail('Product belongs to a different owner.', 403);
  const pack = await tx.productPackage.findUnique({ where: { id: c.packageId } });
  if (!pack || pack.productId !== item.catalogId) return fail('Packaging does not belong to this product.');
  const where = { inventoryId_packageId_location: { inventoryId: item.id, packageId: pack.id, location: c.location } };
  const current = await tx.stockBalance.findUnique({ where });
  const quantity = (current?.quantity || 0) + c.quantity;
  const reserved = (current?.reserved || 0) + (c.reservedDelta || 0);
  const baseUnits = c.quantity * pack.unitsPerPackage;
  if (!Number.isSafeInteger(baseUnits) || Math.abs(baseUnits) > 2147483647 || quantity < 0 || reserved < 0 || reserved > quantity) {
    fail(`Insufficient unreserved ${pack.name} stock for ${item.productName} in ${c.location}. Open a pack or restock first.`, 409);
  }
  await tx.stockBalance.upsert({ where, create: { inventoryId: item.id, packageId: pack.id, location: c.location, quantity, reserved }, update: { quantity, reserved } });
  await tx.inventory.update({ where: { id: item.id }, data: { stockQuantity: { increment: baseUnits }, version: { increment: 1 } } });
  await tx.stockMovement.create({ data: { operationId: op.id, storeId: item.storeId, inventoryId: item.id,
    packageId: pack.id, location: c.location, kind: c.kind, quantity: c.quantity, baseUnits,
    reservedDelta: c.reservedDelta || 0, unitCost: c.unitCost ?? item.costPrice, reason: c.reason, reference: c.reference } });
}

export async function receiveCostedStock(tx: Tx, op: Operation, c: Change & { unitCost: Prisma.Decimal.Value }) {
  if (c.quantity <= 0) fail('Receiving quantity must be positive.');
  const item = await tx.inventory.findUniqueOrThrow({ where: { id: c.inventoryId } });
  const pack = await tx.productPackage.findUniqueOrThrow({ where: { id: c.packageId } });
  const units = c.quantity * pack.unitsPerPackage;
  const cost = D(item.costPrice).mul(item.stockQuantity).plus(D(c.unitCost).mul(units)).div(item.stockQuantity + units).toDecimalPlaces(6);
  await changeStock(tx, op, c);
  await tx.inventory.update({ where: { id: item.id }, data: { costPrice: cost } });
}

export async function ensureStoreInventory(tx: Tx, productId: string, storeId: string, defaults: { costPrice: Prisma.Decimal.Value; sellingPrice: Prisma.Decimal.Value }) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
  if (store.ownerId !== product.ownerId) fail('Products cannot cross owner accounts.', 403);
  const item = await tx.inventory.upsert({ where: { storeId_catalogId: { storeId, catalogId: productId } },
    update: {}, create: { storeId, catalogId: productId, sku: product.sku, productName: product.name, category: product.category,
      costPrice: D(defaults.costPrice), sellingPrice: D(defaults.sellingPrice), stockQuantity: 0, reorderLevel: 0 } });
  if (item.archivedAt) fail(`Restore ${item.productName} at the destination before receiving it.`, 409);
  return item;
}
