import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

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

    const inventory = await prisma.inventory.findMany({ where: { storeId } });
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
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
      reorderLevel: rawData.reorder_level !== undefined ? rawData.reorder_level : (rawData.reorderLevel || 10)
    };

    const validatedData = inventorySchema.parse(mappedData);
    if (!(await canAccessStore((req as any).user.id, validatedData.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const item = await prisma.inventory.create({ data: validatedData });
    
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
    
    // Auto-generate SKU and defaults
    const newItems = items.map((item: any) => ({
      storeId,
      productName: item.productName,
      category: item.category || 'General',
      sku: `SKU-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      sellingPrice: item.sellingPrice,
      costPrice: item.sellingPrice * 0.7, // Assume 30% margin if not provided
      stockQuantity: 0,
      reorderLevel: 10
    }));

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
    const validatedData = inventorySchema.omit({ storeId: true }).partial().parse(req.body);
    
    const updated = await prisma.inventory.update({
      where: { id },
      data: validatedData
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
      
      const io = req.app.get('io');
      if (io) io.to(`store-${item.storeId}`).emit('inventory_updated', { storeId: item.storeId, action: 'delete', data: { id } });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

export default router;
