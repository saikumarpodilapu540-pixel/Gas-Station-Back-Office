import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);

const connectSchema = z.object({
  storeId: z.string().uuid(),
  provider: z.enum(['SQUARE', 'GENERIC']),
  apiKey: z.string().min(5)
});

// Connect POS
router.post('/connect', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { storeId, provider, apiKey } = connectSchema.parse(req.body);
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }

    const integration = await prisma.posIntegration.upsert({
      where: { storeId },
      update: { provider, apiKey, status: 'ACTIVE' },
      create: { storeId, provider, apiKey, status: 'ACTIVE' }
    });

    const { apiKey: _apiKey, ...safeIntegration } = integration;
    res.json({ message: 'POS connected successfully', integration: safeIntegration });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || 'Failed to connect POS' });
  }
});

// Check Status
router.get('/status', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId || !(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const integration = await prisma.posIntegration.findUnique({ where: { storeId } });
    
    if (!integration || integration.status !== 'ACTIVE') return res.json({ connected: false });
    
    // Mask API key for security
    const { apiKey, ...safeData } = integration;
    res.json({ connected: true, integration: safeData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch POS status' });
  }
});

router.post('/disconnect', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const storeId = req.body.storeId || (req as any).user.storeId;
    if (!storeId || !(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    await prisma.posIntegration.update({ where: { storeId }, data: { status: 'INACTIVE' } });
    res.json({ connected: false });
  } catch (error: any) {
    res.status(error?.code === 'P2025' ? 404 : 400).json({ error: 'No POS integration found for this store' });
  }
});

const syncSchema = z.object({
  storeId: z.string().uuid(),
  transactions: z.array(z.object({
    id: z.string(),
    timestamp: z.string(),
    paymentType: z.enum(['CASH', 'CREDIT', 'DEBIT', 'EBT', 'OTHER']),
    items: z.array(z.object({
      sku: z.string(),
      quantity: z.number().int().positive(),
      price: z.number().nonnegative()
    }))
  })).default([])
});

// Manual Sync or Webhook endpoint
router.post('/sync', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { storeId, transactions } = syncSchema.parse(req.body);
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }

    const integration = await prisma.posIntegration.findUnique({ where: { storeId } });
    if (!integration || integration.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'No active POS integration found' });
    }

    let syncedCount = 0;
    let skippedCount = 0;

    for (const transaction of transactions) {
      // Execute in transaction to maintain integrity per sale
      await prisma.$transaction(async (tx) => {
        // 1. Check if already processed (avoid duplicates)
        const existingSale = await tx.sale.findUnique({
          where: { storeId_externalId: { storeId, externalId: transaction.id } }
        });
        
        if (existingSale) {
          skippedCount++;
          return; // Skip duplicate
        }

        let totalAmount = 0;
        const saleItemsData = [];

        // 2. Map POS items -> inventory items
        for (const item of transaction.items) {
          const product = await tx.inventory.findUnique({ where: { sku: item.sku } });
          
          if (!product) {
            console.warn(`Product SKU ${item.sku} not found in inventory, skipping item.`);
            continue;
          }

          // 4. Reduce inventory
          const stockUpdate = await tx.inventory.updateMany({
            where: { id: product.id, stockQuantity: { gte: item.quantity } },
            data: { stockQuantity: { decrement: item.quantity } }
          });
          if (stockUpdate.count !== 1) throw new Error(`Insufficient stock for SKU ${item.sku}`);

          const lineTotal = item.price * item.quantity;
          totalAmount += lineTotal;

          saleItemsData.push({
            productId: product.id,
            quantity: item.quantity,
            price: item.price,
            cost: product.costPrice
          });
        }

        if (saleItemsData.length === 0) return; // Skip if no items mapped

        // 3. Create sales entry
        const targetDate = new Date(transaction.timestamp);
        const sale = await tx.sale.create({
          data: {
            storeId,
            externalId: transaction.id,
            date: targetDate,
            category: 'store',
            paymentType: transaction.paymentType,
            totalAmount,
            saleItems: {
              create: saleItemsData
            }
          }
        });

        // 5. Update daily closing
        // Find if closing exists for this date
        const existingClosing = await tx.dailyClosing.findFirst({
          where: { 
            storeId, 
            date: {
              gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
              lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
            } 
          }
        });

        if (existingClosing) {
          await tx.dailyClosing.update({
            where: { id: existingClosing.id },
            data: { 
              totalSales: Number(existingClosing.totalSales) + totalAmount,
              netProfit: Number(existingClosing.netProfit) + totalAmount
            }
          });
        } else {
          // Note: PostgreSQL requires Date only, so we extract the date part
          const dateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
          try {
            await tx.dailyClosing.create({
              data: {
                storeId,
                date: dateOnly,
                totalSales: totalAmount,
                totalExpenses: 0,
                netProfit: totalAmount
              }
            });
          } catch (err) {
            // Safe fallback if unique constraint hit due to race conditions
            console.warn("Daily closing already created, skipping.");
          }
        }
        
        syncedCount++;
      });
    }

    // Update last sync time
    await prisma.posIntegration.update({
      where: { storeId },
      data: { lastSync: new Date() }
    });

    // 6. Update dashboard (Emit WebSocket real-time updates)
    const io = req.app.get('io');
    if (io) {
      io.to(`store-${storeId}`).emit('sales_updated', { storeId });
      io.to(`store-${storeId}`).emit('inventory_updated', { storeId });
    }

    res.json({ message: `Successfully synced ${syncedCount} transactions. Skipped ${skippedCount} duplicates.` });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message || 'Failed to sync POS' });
  }
});

const csvSchema = z.object({
  storeId: z.string().uuid(),
  date: z.string(), // Provide a general date for the import
  filename: z.string().optional(), // Track filename to prevent duplicates
  rows: z.array(z.object({
    productName: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative()
  }))
});

router.post('/import-csv', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { storeId, date, filename, rows } = csvSchema.parse(req.body);
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const targetDate = new Date(date);
    
    // Check for duplicate file import
    if (filename) {
      const existingImport = await prisma.sale.findFirst({
        where: { storeId, externalId: filename }
      });
      if (existingImport) {
        return res.status(400).json({ error: `File '${filename}' has already been imported.` });
      }
    }

    // Fetch all inventory for intelligent matching
    const allInventory = await prisma.inventory.findMany({ where: { storeId } });
    
    // Fetch saved manual mappings
    const savedMappings = await prisma.posItemMapping.findMany({ where: { storeId } });

    let matchedCount = 0;
    let unmatchedCount = 0;
    let totalSalesAmt = 0;
    let errors: string[] = [];
    let unmatchedItems: string[] = []; // For UI manual mapping

    await prisma.$transaction(async (tx) => {
      const saleItemsData = [];

      for (const row of rows) {
        let match = null;
        
        // 1. Check explicit manual mapping
        const explicitMapping = savedMappings.find(m => m.posItemName === row.productName);
        if (explicitMapping) {
          match = allInventory.find(i => i.id === explicitMapping.inventoryId);
        }

        // 2. Intelligent auto-match (ignore case, trim spaces)
        if (!match) {
          const lowerName = row.productName.toLowerCase().trim();
          match = allInventory.find(i => i.productName.toLowerCase().trim() === lowerName);
          
          if (!match) {
            match = allInventory.find(i => i.productName.toLowerCase().includes(lowerName) || lowerName.includes(i.productName.toLowerCase()));
          }
        }

        if (match) {
          // Update inventory
          const stockUpdate = await tx.inventory.updateMany({
            where: { id: match.id, stockQuantity: { gte: row.quantity } },
            data: { stockQuantity: { decrement: row.quantity } }
          });
          if (stockUpdate.count !== 1) {
            throw new Error(`Insufficient stock for ${row.productName}`);
          }

          const lineTotal = row.price * row.quantity;
          totalSalesAmt += lineTotal;

          saleItemsData.push({
            productId: match.id,
            quantity: row.quantity,
            price: row.price,
            cost: match.costPrice
          });

          matchedCount++;
        } else {
          unmatchedCount++;
          errors.push(`Could not map product: ${row.productName}`);
          if (!unmatchedItems.includes(row.productName)) {
            unmatchedItems.push(row.productName);
          }
        }
      }

      if (saleItemsData.length > 0) {
        // Auto-create sales entry
        await tx.sale.create({
          data: {
            storeId,
            date: targetDate,
            externalId: filename || `csv-import-${Date.now()}`,
            category: 'csv_import',
            paymentType: 'OTHER',
            totalAmount: totalSalesAmt,
            saleItems: {
              create: saleItemsData
            }
          }
        });

        // Update Daily Closing
        const dateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
        const existingClosing = await tx.dailyClosing.findFirst({
          where: { 
            storeId, 
            date: {
              gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
              lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
            } 
          }
        });

        if (existingClosing) {
          await tx.dailyClosing.update({
            where: { id: existingClosing.id },
            data: { 
              totalSales: Number(existingClosing.totalSales) + totalSalesAmt,
              netProfit: Number(existingClosing.netProfit) + totalSalesAmt // Assumes expenses didn't change
            }
          });
        } else {
          try {
            await tx.dailyClosing.create({
              data: {
                storeId,
                date: dateOnly,
                totalSales: totalSalesAmt,
                totalExpenses: 0,
                netProfit: totalSalesAmt
              }
            });
          } catch(err) {}
        }
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`store-${storeId}`).emit('sales_updated', { storeId });
      io.to(`store-${storeId}`).emit('inventory_updated', { storeId });
    }

    res.json({ 
      message: `Successfully imported CSV. Matched ${matchedCount} items. Unmatched: ${unmatchedCount}`,
      matchedCount,
      unmatchedCount,
      errors,
      unmatchedItems, // Pass back to frontend for manual mapping
      filename: filename || 'Manual Upload'
    });

  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message || 'Failed to import CSV' });
  }
});

// Auto-read from folder (simulated)
router.post('/auto-scan', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const storeId = req.body.storeId || (req as any).user.storeId;
    if (!storeId || !(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const simulatedFilename = `sftp_report_${new Date().toISOString().split('T')[0]}.csv`;
    
    // Check if already processed
    const existing = await prisma.sale.findFirst({
      where: { storeId, externalId: simulatedFilename }
    });

    if (existing) {
      return res.json({ 
        message: 'No new files detected in SFTP folder.',
        filename: simulatedFilename,
        matchedCount: 0,
        unmatchedCount: 0,
        errors: []
      });
    }

    // Simulate an import of 2 random items
    const inventory = await prisma.inventory.findMany({ where: { storeId }, take: 2 });
    if (inventory.length === 0) {
      return res.status(400).json({ error: 'No inventory found to simulate auto-scan' });
    }

    await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const saleItemsData = [];
      for (const item of inventory) {
        const qty = 5;
        const lineTotal = Number(item.sellingPrice) * qty;
        totalAmount += lineTotal;

        const stockUpdate = await tx.inventory.updateMany({
          where: { id: item.id, stockQuantity: { gte: qty } },
          data: { stockQuantity: { decrement: qty } }
        });
        if (stockUpdate.count !== 1) throw new Error(`Insufficient stock for ${item.productName}`);

        saleItemsData.push({
          productId: item.id,
          quantity: qty,
          price: item.sellingPrice,
          cost: item.costPrice
        });
      }

      await tx.sale.create({
        data: {
          storeId,
          externalId: simulatedFilename,
          date: new Date(),
          category: 'sftp_auto_import',
          paymentType: 'OTHER',
          totalAmount,
          saleItems: { create: saleItemsData }
        }
      });
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`store-${storeId}`).emit('sales_updated', { storeId });
      io.to(`store-${storeId}`).emit('inventory_updated', { storeId });
    }

    res.json({
      message: 'Successfully auto-scanned and imported 1 new file from folder.',
      filename: simulatedFilename,
      matchedCount: inventory.length,
      unmatchedCount: 0,
      errors: []
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to run auto-scan.' });
  }
});

// GET saved mappings
router.get('/mappings', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId || !(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const mappings = await prisma.posItemMapping.findMany({
      where: { storeId },
      include: { inventory: true }
    });
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// POST save manual mapping
router.post('/mappings', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const schema = z.object({
      storeId: z.string().uuid(),
      posItemName: z.string().min(1),
      inventoryId: z.string().uuid()
    });
    const { storeId, posItemName, inventoryId } = schema.parse(req.body);
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const inventory = await prisma.inventory.findFirst({ where: { id: inventoryId, storeId } });
    if (!inventory) return res.status(400).json({ error: 'Inventory item does not belong to this store' });

    const mapping = await prisma.posItemMapping.upsert({
      where: { storeId_posItemName: { storeId, posItemName } },
      update: { inventoryId },
      create: { storeId, posItemName, inventoryId }
    });
    
    res.json({ message: 'Mapping saved successfully', mapping });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to save mapping' });
  }
});

export default router;
