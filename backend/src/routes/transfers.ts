import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, emitStore, endpoint, keyOf } from '../utils/http';
import { operate, ownerFor } from '../services/operations';
import { createTransfer, createTransferSchema, getTransfer, postReceipt, receiptSchema, transferInclude, transferMoney, transitionTransfer } from '../services/transfers';
import { transferPdf } from '../services/transferPdf';
const router = Router(); router.use(requireAuth);
router.get('/stores', endpoint(async (req, res) => {
  const ownerId = await ownerFor(prisma, actorOf(req));
  res.json(await prisma.store.findMany({ where: { ownerId }, select: { id: true, name: true, location: true, timezone: true }, orderBy: { name: 'asc' } }));
}));
router.get('/', endpoint(async (req, res) => {
  const actor = actorOf(req); const ownerId = await ownerFor(prisma, actor);
  const rows = await prisma.stockTransfer.findMany({ where: { ownerId, ...(actor.role === 'OWNER' ? {} : { OR: [{ sourceStoreId: actor.storeId || '' }, { destinationStoreId: actor.storeId || '' }] }) }, include: transferInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(rows.map(transferMoney));
}));
router.get('/:id', endpoint(async (req, res) => {
  const actor = actorOf(req); const t = await getTransfer(prisma, { actor, ownerId: await ownerFor(prisma, actor) }, String(req.params.id)); res.json(transferMoney(t));
}));
router.get('/:id/pdf', endpoint(async (req, res) => {
  const actor = actorOf(req); const t = await getTransfer(prisma, { actor, ownerId: await ownerFor(prisma, actor) }, String(req.params.id));
  const [source, destination] = await Promise.all([prisma.store.findUniqueOrThrow({ where: { id: t.sourceStoreId } }), prisma.store.findUniqueOrThrow({ where: { id: t.destinationStoreId } })]);
  const pdf = await transferPdf(transferMoney(t), source, destination);
  res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${t.number}.pdf"`); res.send(pdf);
}));
router.post('/', endpoint(async (req, res) => {
  const data = createTransferSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'transfer-create', data }, (tx, op) => createTransfer(tx, op, data));
  res.status(201).json(transferMoney(result));
}));
router.post('/:id/:action', endpoint(async (req, res) => {
  const id = String(req.params.id), action = String(req.params.action);
  const data = action === 'receipt' ? receiptSchema.parse(req.body) : null;
  const result = await operate(actorOf(req), keyOf(req), { action: `transfer-${action}`, id, data }, (tx, op) => data ? postReceipt(tx, op, id, data) : transitionTransfer(tx, op, id, action));
  emitStore(req, result.sourceStoreId); emitStore(req, result.destinationStoreId); res.json(transferMoney(result));
}));
export default router;
