import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const STORE_ID = '00000000-0000-4000-8000-000000000101';

async function main() {
  const password = await bcrypt.hash('admin123', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'admin@fuelops.com' },
    update: { name: 'FuelOps Owner', password, role: 'OWNER' },
    create: {
      id: OWNER_ID,
      name: 'FuelOps Owner',
      email: 'admin@fuelops.com',
      password,
      role: 'OWNER'
    }
  });

  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'FuelOps Downtown', location: 'Dallas, TX', ownerId: owner.id },
    create: {
      id: STORE_ID,
      name: 'FuelOps Downtown',
      location: 'Dallas, TX',
      ownerId: owner.id
    }
  });

  await prisma.user.update({
    where: { email: 'admin@fuelops.com' },
    data: { storeId: STORE_ID }
  });

  const products = [
    { productName: 'Bottled Water', category: 'Grocery (Pop/Beverages)', sku: 'WATER-001', costPrice: 0.65, sellingPrice: 1.49, stockQuantity: 96, reorderLevel: 24 },
    { productName: 'Regular Coffee', category: 'Hot Food', sku: 'COFFEE-001', costPrice: 0.55, sellingPrice: 2.29, stockQuantity: 80, reorderLevel: 20 },
    { productName: 'Potato Chips', category: 'Grocery (Pop/Beverages)', sku: 'CHIPS-001', costPrice: 1.05, sellingPrice: 2.49, stockQuantity: 48, reorderLevel: 12 }
  ];

  for (const product of products) {
    await prisma.inventory.upsert({
      where: { sku: product.sku },
      update: { ...product, storeId: STORE_ID },
      create: { ...product, storeId: STORE_ID }
    });
  }

  const tanks = [
    { fuelType: 'Regular', tankCapacity: 10000, currentLevel: 7200, pricePerGallon: 3.49, costPerGallon: 2.85 },
    { fuelType: 'Premium', tankCapacity: 8000, currentLevel: 5400, pricePerGallon: 3.99, costPerGallon: 3.25 },
    { fuelType: 'Diesel', tankCapacity: 12000, currentLevel: 8100, pricePerGallon: 3.79, costPerGallon: 3.05 }
  ];

  for (const tank of tanks) {
    await prisma.fuelTank.upsert({
      where: { storeId_fuelType: { storeId: STORE_ID, fuelType: tank.fuelType } },
      update: tank,
      create: { storeId: STORE_ID, ...tank }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
