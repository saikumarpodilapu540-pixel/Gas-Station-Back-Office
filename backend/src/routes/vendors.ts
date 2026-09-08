import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint, keyOf } from '../utils/http';
import { accessStore, audit, fail, manager, operate, ownerFor } from '../services/operations';
const router = Router(); router.use(requireAuth);
const schema = z.object({ name: z.string().trim().min(2).max(150), category: z.string().trim().min(1).max(100), contactInfo: z.string().trim().max(255).nullable().optional() });
const include = { purchases: { orderBy: { date: 'desc' as const }, take: 1 }, _count: { select: { purchases: true } } } as const;
const view = (v: any) => ({ ...v, status: v.archivedAt ? 'Archived' : 'Active', lastOrder: v.purchases?.[0]?.date ? new Date(v.purchases[0].date).toISOString().slice(0,10) : 'N/A', rating: v._count?.purchases ? 'Established' : 'New', purchaseCount: v._count?.purchases || 0 });
router.get('/', endpoint(async (req, res) => {
  const ownerId = await ownerFor(prisma, actorOf(req));
  res.json((await prisma.vendor.findMany({ where: { ownerId, archivedAt: null }, include, orderBy: { name: 'asc' } })).map(view));
}));
router.get('/:id', endpoint(async (req, res) => {
  const ownerId = await ownerFor(prisma, actorOf(req)); const v = await prisma.vendor.findFirst({ where: { id: String(req.params.id), ownerId }, include });
  if (!v) fail('Vendor not found.',404); res.json(view(v));
}));
router.post('/', endpoint(async (req, res) => {
  const data = schema.parse(req.body), storeId = z.string().uuid().parse(req.body.storeId);
  const result = await operate(actorOf(req), keyOf(req), { action: 'create-vendor', data, storeId }, async (tx, op) => {
    manager(op.actor); await accessStore(tx, op.actor, storeId);
    const v = await tx.vendor.create({ data: { ...data, ownerId: op.ownerId }, include }); await audit(tx, op, storeId, 'Added vendor', v, 'Vendors'); return v;
  }); res.status(201).json(view(result));
}));
router.put('/:id', endpoint(async (req, res) => {
  const id = String(req.params.id), data = schema.partial().parse(req.body), storeId = z.string().uuid().parse(req.body.storeId);
  const result = await operate(actorOf(req), keyOf(req), { action: 'edit-vendor', id, data, storeId }, async (tx, op) => {
    manager(op.actor); await accessStore(tx, op.actor, storeId);
    const v = await tx.vendor.findFirst({ where: { id, ownerId: op.ownerId } }); if (!v) fail('Vendor not found.',404);
    const updated = await tx.vendor.update({ where: { id }, data, include }); await audit(tx, op, storeId, 'Updated vendor', { before: v, after: updated }, 'Vendors'); return updated;
  }); res.json(view(result));
}));
router.delete('/:id', endpoint(async (req, res) => {
  const id = String(req.params.id), storeId = z.string().uuid().parse(req.query.storeId);
  res.json(await operate(actorOf(req), keyOf(req), { action: 'archive-vendor', id, storeId }, async (tx, op) => {
    manager(op.actor); await accessStore(tx, op.actor, storeId);
    const v = await tx.vendor.findFirst({ where: { id, ownerId: op.ownerId } }); if (!v) fail('Vendor not found.',404);
    await tx.vendor.update({ where: { id }, data: { archivedAt: new Date() } }); await audit(tx, op, storeId, 'Archived vendor', v, 'Vendors'); return { success: true };
  }));
}));
export default router;
