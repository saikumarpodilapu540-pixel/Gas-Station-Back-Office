import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);

const saleSchema = z.object({
  storeId: z.string().uuid(),
  category: z.string().optional(),
  paymentType: z.enum(['CASH', 'CREDIT', 'DEBIT', 'EBT', 'OTHER']),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive('Quantity must be greater than zero')
  })).min(1, 'Sales cannot exist without items')
});

router.post('/', async (req, res) => {
  try {
    const validatedData = saleSchema.parse(req.body);
    const { storeId, category, paymentType, items } = validatedData;
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }

    // Calculate total amount and start transaction
    let totalAmount = 0;
    
    // We use a transaction to ensure inventory is deducted and sale is recorded atomically
    const result = await prisma.$transaction(async (tx) => {
      const saleItemsData = [];

      for (const item of items) {
        // Fetch current product
        const product = await tx.inventory.findFirst({ where: { id: item.productId, storeId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const inventoryUpdate = await tx.inventory.updateMany({
          where: { id: item.productId, storeId, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } }
        });
        if (inventoryUpdate.count !== 1) throw new Error(`Stock not available for ${product.productName}`);

        const lineTotal = Number(product.sellingPrice) * item.quantity;
        totalAmount += lineTotal;

        saleItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.sellingPrice,
          cost: product.costPrice
        });
      }

      // Create Sale record
      const sale = await tx.sale.create({
        data: {
          storeId,
          category: category || 'store',
          paymentType,
          totalAmount,
          saleItems: {
            create: saleItemsData
          }
        },
        include: { saleItems: true }
      });

      return sale;
    });

    const io = req.app.get('io');
    if (io) io.to(`store-${storeId}`).emit('sales_updated', { storeId, data: result });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Sale processing failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const sales = await prisma.sale.findMany({
      where: { storeId },
      include: { saleItems: { include: { product: true } } },
      orderBy: { date: 'desc' },
      take: 50
    });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

export default router;
