import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const STORE_A_ID = '00000000-0000-4000-8000-000000000101';
const STORE_B_ID = '00000000-0000-4000-8000-000000000102';
const password = 'admin123';

type Sample = { sku: string; name: string; category: string; baseCost: number; price: number; reorder: number; packages: { name: string; units: number; barcode: string; quantityByStore: Record<string, number> }[] };
const samples: Sample[] = [
  { sku: 'WATER-001', name: 'Bottled Water 16.9oz', category: 'Grocery (Pop/Beverages)', baseCost: .65, price: 1.49, reorder: 24,
    packages: [{ name: 'Each', units: 1, barcode: '049000000001', quantityByStore: { [STORE_A_ID]: 96, [STORE_B_ID]: 48 } }, { name: 'Case (24)', units: 24, barcode: '049000000002', quantityByStore: { [STORE_A_ID]: 4, [STORE_B_ID]: 2 } }] },
  { sku: 'SODA-COKE-20', name: 'Coca-Cola 20oz', category: 'Grocery (Pop/Beverages)', baseCost: .72, price: 2.49, reorder: 20,
    packages: [{ name: 'Each', units: 1, barcode: '049000000101', quantityByStore: { [STORE_A_ID]: 48, [STORE_B_ID]: 24 } }, { name: 'Six-Pack', units: 6, barcode: '049000000102', quantityByStore: { [STORE_A_ID]: 6, [STORE_B_ID]: 3 } }, { name: 'Case (24)', units: 24, barcode: '049000000103', quantityByStore: { [STORE_A_ID]: 2, [STORE_B_ID]: 1 } }] },
  { sku: 'BEER-DOM-12', name: 'Domestic Beer 12oz', category: 'Beer/Liquor', baseCost: 1.05, price: 2.29, reorder: 12,
    packages: [{ name: 'Each', units: 1, barcode: '012000000201', quantityByStore: { [STORE_A_ID]: 24, [STORE_B_ID]: 12 } }, { name: 'Six-Pack', units: 6, barcode: '012000000202', quantityByStore: { [STORE_A_ID]: 8, [STORE_B_ID]: 4 } }, { name: 'Case (24)', units: 24, barcode: '012000000203', quantityByStore: { [STORE_A_ID]: 1, [STORE_B_ID]: 1 } }] },
  { sku: 'CHIPS-001', name: 'Potato Chips', category: 'Grocery (Pop/Beverages)', baseCost: 1.05, price: 2.49, reorder: 12,
    packages: [{ name: 'Each', units: 1, barcode: '028400000301', quantityByStore: { [STORE_A_ID]: 48, [STORE_B_ID]: 24 } }] },
  { sku: 'COFFEE-001', name: 'Regular Coffee', category: 'Hot Food', baseCost: .55, price: 2.29, reorder: 20,
    packages: [{ name: 'Each', units: 1, barcode: '000000000401', quantityByStore: { [STORE_A_ID]: 80, [STORE_B_ID]: 40 } }] },
  { sku: 'ENERGY-001', name: 'Energy Drink 16oz', category: 'Grocery (Pop/Beverages)', baseCost: 1.20, price: 3.49, reorder: 12,
    packages: [{ name: 'Each', units: 1, barcode: '070000000501', quantityByStore: { [STORE_A_ID]: 36, [STORE_B_ID]: 18 } }, { name: 'Case (12)', units: 12, barcode: '070000000502', quantityByStore: { [STORE_A_ID]: 2, [STORE_B_ID]: 1 } }] },
  { sku: 'SANDWICH-001', name: 'Turkey Sandwich', category: 'Prepared Food', baseCost: 3.10, price: 6.99, reorder: 8,
    packages: [{ name: 'Each', units: 1, barcode: '000000000601', quantityByStore: { [STORE_A_ID]: 12, [STORE_B_ID]: 6 } }] }
];

async function main() {
  const hashed = await bcrypt.hash(password, 10);
  const owner = await prisma.user.upsert({ where: { email: 'admin@fuelops.com' }, update: { name: 'FuelOps Owner', role: 'OWNER' }, create: { id: OWNER_ID, name: 'FuelOps Owner', email: 'admin@fuelops.com', password: hashed, role: 'OWNER' } });
  const stores = [
    { id: STORE_A_ID, name: 'FuelOps Downtown', location: 'Dallas, TX' },
    { id: STORE_B_ID, name: 'FuelOps North', location: 'Dallas, TX' }
  ];
  for (const store of stores) await prisma.store.upsert({ where: { id: store.id }, update: { name: store.name, location: store.location, ownerId: owner.id }, create: { ...store, ownerId: owner.id } });
  await prisma.user.update({ where: { id: owner.id }, data: { storeId: STORE_A_ID } });
  const tanks = [
    { fuelType: 'Regular', tankCapacity: 10000, currentLevel: 7200, pricePerGallon: 3.49, costPerGallon: 2.85 },
    { fuelType: 'Premium', tankCapacity: 8000, currentLevel: 5400, pricePerGallon: 3.99, costPerGallon: 3.25 },
    { fuelType: 'Diesel', tankCapacity: 12000, currentLevel: 8100, pricePerGallon: 3.79, costPerGallon: 3.05 }
  ];
  for (const tank of tanks) await prisma.fuelTank.upsert({ where: { storeId_fuelType: { storeId: STORE_A_ID, fuelType: tank.fuelType } }, update: {}, create: { storeId: STORE_A_ID, ...tank } });

  for (const sample of samples) {
    const product = await prisma.product.upsert({ where: { ownerId_sku: { ownerId: owner.id, sku: sample.sku } }, update: { name: sample.name, category: sample.category }, create: { ownerId: owner.id, sku: sample.sku, name: sample.name, category: sample.category, baseUnit: 'each' } });
    const packageIds = new Map<string, string>();
    for (const p of sample.packages) {
      const pack = await prisma.productPackage.upsert({ where: { productId_name: { productId: product.id, name: p.name } }, update: { unitsPerPackage: p.units, barcode: p.barcode }, create: { productId: product.id, name: p.name, unitsPerPackage: p.units, barcode: p.barcode } });
      packageIds.set(p.name, pack.id);
    }
    for (const store of stores) {
      const initial = sample.packages.reduce((sum, p) => sum + (p.quantityByStore[store.id] || 0) * p.units, 0);
      const item = await prisma.inventory.upsert({ where: { storeId_catalogId: { storeId: store.id, catalogId: product.id } }, update: {}, create: { storeId: store.id, catalogId: product.id, sku: sample.sku, productName: sample.name, category: sample.category, costPrice: sample.baseCost, sellingPrice: sample.price, stockQuantity: 0, reorderLevel: sample.reorder } });
      const balances = await prisma.stockBalance.count({ where: { inventoryId: item.id } });
      if (balances > 0) continue; // Safe to rerun: never reset real stock.
      const operation = await prisma.stockOperation.create({ data: { ownerId: owner.id, actorId: owner.id, key: `seed-opening:${store.id}:${sample.sku}`, requestHash: 'seed-v3', result: {} } });
      for (const p of sample.packages) {
        const quantity = p.quantityByStore[store.id] || 0; if (!quantity) continue;
        const packageId = packageIds.get(p.name)!;
        await prisma.stockBalance.create({ data: { inventoryId: item.id, packageId, location: 'BACKROOM', quantity, reserved: 0, sellingPrice: p.units === 1 ? sample.price : Number((sample.price * p.units * 0.92).toFixed(2)) } });
        await prisma.stockMovement.create({ data: { operationId: operation.id, storeId: store.id, inventoryId: item.id, packageId, location: 'BACKROOM', kind: 'OPENING', quantity, baseUnits: quantity * p.units, unitCost: sample.baseCost, reason: 'Phase 3 sample opening stock' } });
      }
      await prisma.inventory.update({ where: { id: item.id }, data: { stockQuantity: initial } });
    }
  }
  console.log(`Seeded owner, two stores, ${samples.length} products, pack definitions, and safe opening balances. Existing balances were preserved.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
