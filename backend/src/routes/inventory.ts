import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';
import { writeAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);

const inventorySchema = z.object({
  storeId: z.string().uuid(),
  productName: z.string().min(1),
  category: z.string().min(1),
  sku: z.string().min(1),
  costPrice: z.number().positive('Cost price is required and must be positive'),
  sellingPrice: z.number().positive(),
  stockQuantity: z.number().int().min(0, 'Inventory cannot be negative'),
  reorderLevel: z.number().int().min(0).optional().default(0),
});

// All authenticated users can view inventory
router.get('/', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }

    const where: any = { storeId };
    if (req.query.category) where.category = req.query.category;
    if (req.query.search) {
      where.OR = [
        { productName: { contains: req.query.search as string, mode: 'insensitive' } },
        { sku: { contains: req.query.search as string, mode: 'insensitive' } }
      ];
    }
    if (req.query.stock === 'low') where.stockQuantity = { lte: 10 };
    if (req.query.stock === 'out') where.stockQuantity = 0;
    const inventory = await prisma.inventory.findMany({ where, orderBy: { productName: 'asc' } });
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.inventory.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });
    if (!(await canAccessStore((req as any).user.id, item.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const rawData = req.body;
    
    // Map JSON payload (snake_case) to DB Schema (camelCase)
    // Get active store from UI OR fallback to user session
    const mappedData = {
      storeId: rawData.store_id || rawData.storeId || (req as any).user.storeId,
      productName: rawData.product_name || rawData.productName,
      category: rawData.category,
      sku: rawData.sku || `SKU-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      costPrice: rawData.cost_price !== undefined ? rawData.cost_price : rawData.costPrice,
      sellingPrice: rawData.selling_price !== undefined ? rawData.selling_price : rawData.sellingPrice,
      stockQuantity: rawData.stock_quantity !== undefined ? rawData.stock_quantity : rawData.stockQuantity,
      reorderLevel: rawData.reorder_level !== undefined ? rawData.reorder_level : (rawData.reorderLevel ?? 10)
    };

    const validatedData = inventorySchema.parse(mappedData);
    if (!(await canAccessStore((req as any).user.id, validatedData.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const item = await prisma.inventory.create({ data: validatedData });
    await writeAuditLog(prisma, {
      storeId: item.storeId,
      userId: (req as any).user.id,
      action: `Added product: ${item.productName}`,
      module: 'Inventory',
      oldValue: null,
      newValue: `${item.sku}, stock ${item.stockQuantity}`
    });
    
    const io = req.app.get('io');
    if (io) io.to(`store-${validatedData.storeId}`).emit('inventory_updated', { storeId: validatedData.storeId });
    
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.errors || 'Validation Failed' });
  }
});

router.post('/import-csv', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { storeId, items } = req.body;
    if (!storeId || !(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one catalog item is required' });
    }
    
    // Auto-generate SKU and defaults
    const newItems = items.map((item: any) => ({
      storeId,
      productName: item.productName,
      category: item.category || 'General',
      sku: `SKU-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      sellingPrice: Number(item.sellingPrice),
      costPrice: Number(item.costPrice ?? Number(item.sellingPrice) * 0.7),
      stockQuantity: Number(item.stockQuantity ?? 0),
      reorderLevel: Number(item.reorderLevel ?? 10)
    }));

    const invalidItem = newItems.find((item: any) => !item.productName || !Number.isFinite(item.sellingPrice) || item.sellingPrice <= 0 || !Number.isFinite(item.costPrice) || item.costPrice <= 0 || !Number.isInteger(item.stockQuantity) || item.stockQuantity < 0 || !Number.isInteger(item.reorderLevel) || item.reorderLevel < 0);
    if (invalidItem) return res.status(400).json({ error: 'Catalog rows contain invalid price, stock, or reorder values' });

    const result = await prisma.inventory.createMany({
      data: newItems,
      skipDuplicates: true // Prevent crashing if somehow a unique constraint hits
    });

    const io = req.app.get('io');
    if (io) io.to(`store-${storeId}`).emit('inventory_updated', { storeId });

    res.status(201).json({ message: `Successfully imported ${result.count} catalog items.`, count: result.count });
  } catch (error: any) {
    res.status(400).json({ error: 'Failed to import catalog CSV' });
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.inventory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Inventory item not found' });
    if (!(await canAccessStore((req as any).user.id, existing.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const rawData = req.body;
    const mappedData = {
      productName: rawData.product_name ?? rawData.productName,
      category: rawData.category,
      sku: rawData.sku,
      costPrice: rawData.cost_price ?? rawData.costPrice,
      sellingPrice: rawData.selling_price ?? rawData.sellingPrice,
      stockQuantity: rawData.stock_quantity ?? rawData.stockQuantity,
      reorderLevel: rawData.reorder_level ?? rawData.reorderLevel
    };
    const validatedData = inventorySchema.omit({ storeId: true }).partial().parse(mappedData);
    
    const updated = await prisma.inventory.update({
      where: { id },
      data: validatedData
    });
    await writeAuditLog(prisma, {
      storeId: updated.storeId,
      userId: (req as any).user.id,
      action: `Updated product: ${updated.productName}`,
      module: 'Inventory',
      oldValue: `${existing.sku}, stock ${existing.stockQuantity}`,
      newValue: `${updated.sku}, stock ${updated.stockQuantity}`
    });
    
    const io = req.app.get('io');
    if (io) io.to(`store-${updated.storeId}`).emit('inventory_updated', { storeId: updated.storeId, action: 'update', data: updated });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update inventory item' });
  }
});

router.delete('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.inventory.findUnique({ where: { id } });
    if (item) {
      if (!(await canAccessStore((req as any).user.id, item.storeId))) {
        return res.status(403).json({ error: 'You do not have access to this store' });
      }
      await prisma.inventory.delete({ where: { id } });
      await writeAuditLog(prisma, {
        storeId: item.storeId,
        userId: (req as any).user.id,
        action: `Deleted product: ${item.productName}`,
        module: 'Inventory',
        oldValue: `${item.sku}, stock ${item.stockQuantity}`,
        newValue: null
      });
      
      const io = req.app.get('io');
      if (io) io.to(`store-${item.storeId}`).emit('inventory_updated', { storeId: item.storeId, action: 'delete', data: { id } });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(error?.code === 'P2003' ? 409 : 500).json({ error: error?.code === 'P2003' ? 'This product has sales history and cannot be deleted.' : 'Failed to delete inventory item' });
  }
});

export default router;
