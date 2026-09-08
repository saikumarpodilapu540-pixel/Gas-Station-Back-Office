import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint, keyOf } from '../utils/http';
import { accessStore, audit, D, fail, manager, money, operate, ownerFor } from '../services/operations';
import { getTransfer, transferMoney } from '../services/transfers';
const router = Router(); router.use(requireAuth);
const include = { allocations: { include: { transfer: { select: { id: true, number: true } } } } } as const;
const schema = z.object({ fromStoreId: z.string().uuid(), toStoreId: z.string().uuid(), checkNumber: z.string().trim().min(1).max(100),
  checkDate: z.iso.date(), amount: z.number().positive().max(99999999).multipleOf(0.01), notes: z.string().trim().max(1000).default(''),
  allocations: z.array(z.object({ transferId: z.string().uuid(), amount: z.number().positive().max(99999999).multipleOf(0.01) })).min(1).max(100) });
router.get('/', endpoint(async (req, res) => {
  const actor = actorOf(req), ownerId = await ownerFor(prisma, actor);
  res.json(await prisma.settlement.findMany({ where: { ownerId, ...(actor.role === 'OWNER' ? {} : { OR: [{ fromStoreId: actor.storeId || '' }, { toStoreId: actor.storeId || '' }] }) }, include, orderBy: { createdAt: 'desc' }, take: 200 }));
}));
router.post('/', endpoint(async (req, res) => {
  const data = schema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'issue-check', data }, async (tx, op) => {
    manager(op.actor); const from = await accessStore(tx, op.actor, data.fromStoreId);
    const to = await tx.store.findUnique({ where: { id: data.toStoreId } });
    if (!to || to.ownerId !== from.ownerId || from.id === to.id) fail('Choose different stores with the same owner.');
    const total = data.allocations.reduce((sum, a) => sum.plus(a.amount), D(0));
    if (!total.equals(data.amount)) fail('Check amount must equal its transfer allocations.');
    const seen = new Set();
    for (const a of data.allocations) {
      if (seen.has(a.transferId)) fail('Combine duplicate transfer allocations.'); seen.add(a.transferId);
      const t = await getTransfer(tx, op, a.transferId);
      if (!t.dispatchedAt || t.sourceStoreId !== to!.id || t.destinationStoreId !== from.id) fail('The transfer does not match this payment direction.');
      if (money(transferMoney(t).unallocated).lessThan(a.amount)) fail('Allocation exceeds the amount not already covered by a check.', 409);
    }
    const result = await tx.settlement.create({ data: { ownerId: op.ownerId, fromStoreId: from.id, toStoreId: to!.id, checkNumber: data.checkNumber,
      checkDate: new Date(`${data.checkDate}T00:00:00Z`), amount: data.amount, notes: data.notes, createdById: op.actor.id, allocations: { create: data.allocations } }, include });
    await audit(tx, op, from.id, 'Issued transfer settlement check', result, 'Settlements'); return result;
  }); res.status(201).json(result);
}));
router.post('/:id/status', endpoint(async (req, res) => {
  const id = String(req.params.id);
  const data = z.object({ status: z.enum(['DEPOSITED','CLEARED','VOIDED','BOUNCED']), reason: z.string().trim().min(3).max(500) }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'check-status', id, data }, async (tx, op) => {
    manager(op.actor);
    const check = await tx.settlement.findUnique({ where: { id }, include });
    if (!check || check.ownerId !== op.ownerId) return fail('Check not found.', 404);
    await accessStore(tx, op.actor, data.status === 'VOIDED' ? check.fromStoreId : check.toStoreId);
    const allowed: Record<string,string[]> = { ISSUED: ['DEPOSITED','CLEARED','VOIDED','BOUNCED'], DEPOSITED: ['CLEARED','BOUNCED'], CLEARED: ['BOUNCED'], VOIDED: [], BOUNCED: [] };
    if (!allowed[check.status]?.includes(data.status)) fail('This check status transition is not allowed.', 409);
    if (data.status === 'CLEARED') for (const allocation of check.allocations) {
      const t = await getTransfer(tx, op, allocation.transferId);
      if (D(transferMoney(t).outstanding).lessThan(allocation.amount)) fail('A return or another payment changed the amount due. Void or replace this check.', 409);
    }
    const updated = await tx.settlement.update({ where: { id }, data: { status: data.status }, include });
    await audit(tx, op, data.status === 'VOIDED' ? check.fromStoreId : check.toStoreId, 'Changed check status', { id, from: check.status, to: data.status, reason: data.reason }, 'Settlements');
    return updated;
  }); res.json(result);
}));
export default router;
