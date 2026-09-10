import { z } from 'zod';
import { accessStore, audit, changeStock, D, fail, money, Operation, stockItem, Tx } from './operations';
import { assertOpenDay } from './reporting';
export const saleSchema = z.object({ storeId: z.string().uuid(), paymentType: z.enum(['CASH','CREDIT','DEBIT','EBT','OTHER']),
  items: z.array(z.object({ productId: z.string().uuid(), packageId: z.string().uuid().optional(), location: z.enum(['BACKROOM','SHELF']).default('BACKROOM'), quantity: z.number().int().positive().max(100000) })).min(1).max(100) });
export async function createSale(tx: Tx, op: Operation, data: z.infer<typeof saleSchema>, imported?: { externalId: string; date: Date; prices: number[]; taxes: number[] }) {
  await accessStore(tx, op.actor, data.storeId);
  const date = imported?.date || new Date(); await assertOpenDay(tx, data.storeId, date);
  if (imported) {
    const existing = await tx.sale.findUnique({ where: { storeId_externalId: { storeId: data.storeId, externalId: imported.externalId } } });
    if (existing) fail('This POS transaction was already imported.', 409);
  }
  let subtotal = D(0), taxAmount = D(0);
  const lines = [];
  for (const [index, line] of data.items.entries()) {
    const item = await stockItem(tx, op.actor, line.productId);
    if (item.storeId !== data.storeId) fail('Sale item belongs to a different store.', 403);
    const pack = (line.packageId ? item.catalog.packages.find(p => p.id === line.packageId) : item.catalog.packages.find(p => p.unitsPerPackage === 1)); if (!pack) return fail('Select valid packaging.');
    const balance = item.balances.find(b => b.packageId === pack.id && b.location === line.location);
    const price = imported ? D(imported.prices[index]) : pack.unitsPerPackage === 1 ? item.sellingPrice : balance?.sellingPrice;
    if (price === null || price === undefined) fail(`Set a selling price for ${item.productName} / ${pack.name} first.`);
    const value = money(D(price!).mul(line.quantity));
    // Imports supply actual line taxes; terminal taxes use the stored store-product rate.
    const tax = imported ? money(imported.taxes[index]) : money(value.mul(item.taxRate));
    subtotal = subtotal.plus(value); taxAmount = taxAmount.plus(tax);
    await changeStock(tx, op, { inventoryId: item.id, packageId: pack.id, location: line.location, quantity: -line.quantity, kind: 'SALE', reason: imported ? `POS ${imported.externalId}` : 'Sales terminal', reference: op.id });
    lines.push({ productId: item.id, packageId: pack.id, packageName: pack.name, unitsPerPackage: pack.unitsPerPackage,
      category: item.category, quantity: line.quantity, price: price!, cost: D(item.costPrice).mul(pack.unitsPerPackage), taxAmount: tax });
  }
  const result = await tx.sale.create({ data: { storeId: data.storeId, cashierId: op.actor.id, category: imported ? 'pos_import' : 'store', paymentType: data.paymentType,
    date, externalId: imported?.externalId, subtotal, taxAmount, totalAmount: subtotal.plus(taxAmount), saleItems: { create: lines } }, include: { saleItems: true } });
  await audit(tx, op, data.storeId, 'Recorded sale', { saleId: result.id, subtotal, taxAmount, externalId: imported?.externalId }, 'Sales');
  return result;
}
