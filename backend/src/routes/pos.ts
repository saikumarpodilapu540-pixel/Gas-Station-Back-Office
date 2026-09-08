import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, emitStore, endpoint, keyOf } from '../utils/http';
import { accessStore, fail, manager, operate } from '../services/operations';
import { createSale } from '../services/sales';
const router = Router(); router.use(requireAuth);
router.get('/status', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json({ connected: false, manualImportAvailable: true, message: 'Manual reviewed imports are available. No live POS connector is configured.' });
}));
router.post('/auto-scan', (_req, res) => res.status(501).json({ error: 'Automatic POS scanning is not configured. Upload and review an actual sales file.' }));
router.post('/connect', (_req, res) => res.status(501).json({ error: 'Live provider connections are not configured. Manual sales imports are available.' }));
router.post('/disconnect', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.body.storeId); manager(actorOf(req)); await accessStore(prisma, actorOf(req), storeId);
  await prisma.posIntegration.updateMany({ where: { storeId }, data: { status: 'INACTIVE', apiKey: '' } }); res.json({ connected: false });
}));
const row = z.object({ inventoryId: z.string().uuid(), packageId: z.string().uuid(), location: z.enum(['BACKROOM','SHELF']), quantity: z.number().int().positive(), price: z.number().nonnegative(), taxAmount: z.number().nonnegative() });
const schema = z.object({ storeId: z.string().uuid(), externalId: z.string().trim().min(1).max(200), date: z.iso.datetime({ offset: true }), paymentType: z.enum(['CASH','CREDIT','DEBIT','EBT','OTHER']).default('OTHER'), reviewed: z.literal(true), rows: z.array(row).min(1).max(200) });
router.post('/import-csv', endpoint(async (req, res) => {
  const data = schema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'pos-import', data }, async (tx, op) => {
    manager(op.actor);
    return createSale(tx, op, { storeId: data.storeId, paymentType: data.paymentType, items: data.rows.map(r => ({ productId: r.inventoryId, packageId: r.packageId, location: r.location, quantity: r.quantity })) },
      { externalId: data.externalId, date: new Date(data.date), prices: data.rows.map(r => r.price), taxes: data.rows.map(r => r.taxAmount) });
  }); emitStore(req, data.storeId); res.status(201).json({ ...result, message: `Imported ${data.rows.length} reviewed lines.` });
}));
router.post('/sync', (_req, res) => res.status(501).json({ error: 'Live transaction sync is not configured. Use the reviewed import endpoint.' }));
router.get('/mappings', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId); res.json(await prisma.posItemMapping.findMany({ where: { storeId }, include: { inventory: true } }));
}));
router.post('/mappings', endpoint(async (req, res) => {
  const data = z.object({ storeId: z.string().uuid(), inventoryId: z.string().uuid(), posItemName: z.string().trim().min(1).max(150) }).parse(req.body);
  res.json(await operate(actorOf(req), keyOf(req), { action: 'pos-mapping', data }, async (tx, op) => {
    manager(op.actor); await accessStore(tx, op.actor, data.storeId);
    if (!await tx.inventory.findFirst({ where: { id: data.inventoryId, storeId: data.storeId, archivedAt: null } })) fail('Product is not in this store.');
    return tx.posItemMapping.upsert({ where: { storeId_posItemName: { storeId: data.storeId, posItemName: data.posItemName } }, create: data, update: { inventoryId: data.inventoryId } });
  }));
}));
export default router;
