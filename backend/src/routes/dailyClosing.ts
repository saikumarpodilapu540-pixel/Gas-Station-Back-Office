import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint, keyOf } from '../utils/http';
import { accessStore, audit, fail, manager, operate } from '../services/operations';
import { reportSummary } from '../services/reporting';
const router = Router(); router.use(requireAuth);
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json(await prisma.dailyClosing.findMany({ where: { storeId }, orderBy: { date: 'desc' }, take: 100 }));
}));
router.post('/', endpoint(async (req, res) => {
  const data = z.object({ storeId: z.string().uuid(), date: z.iso.date(), action: z.enum(['SAVE','CLOSE','REOPEN']).default('SAVE'), reason: z.string().trim().max(500).default('') }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'daily-close', data }, async (tx, op) => {
    manager(op.actor); const store = await accessStore(tx, op.actor, data.storeId);
    if (data.date > DateTime.now().setZone(store.timezone).toISODate()!) fail('A future business day cannot be closed.');
    const date = new Date(`${data.date}T00:00:00Z`), where = { storeId_date: { storeId: data.storeId, date } };
    const existing = await tx.dailyClosing.findUnique({ where });
    if (data.action === 'REOPEN') {
      if (op.actor.role !== 'OWNER') fail('Only the owner can reopen a business day.', 403);
      if (data.reason.length < 3 || existing?.status !== 'CLOSED') fail('A closed day and a correction reason are required.');
      const updated = await tx.dailyClosing.update({ where, data: { status: 'DRAFT', closedAt: null, revision: { increment: 1 } } });
      await audit(tx, op, store.id, 'Reopened daily close', { before: existing, reason: data.reason }, 'Daily Close'); return updated;
    }
    if (existing?.status === 'CLOSED') fail('Reopen this day before changing the closing.', 409);
    const report = await reportSummary(tx, store.id, { from: data.date, to: data.date });
    if (report.missingCostLines) fail('Historical costs are missing. Resolve them before posting a financial closing.');
    const values = { totalSales: report.totalRevenue, totalExpenses: report.totalExpenses, netProfit: report.netProfit!, costOfGoodsSold: report.costOfGoodsSold,
      taxCollected: report.taxCollected, status: data.action === 'CLOSE' ? 'CLOSED' : 'DRAFT', closedById: data.action === 'CLOSE' ? op.actor.id : null, closedAt: data.action === 'CLOSE' ? new Date() : null };
    const updated = await tx.dailyClosing.upsert({ where, create: { storeId: store.id, date, ...values }, update: { ...values, revision: { increment: 1 } } });
    await audit(tx, op, store.id, 'Calculated daily close', { before: existing, after: updated }, 'Daily Close'); return updated;
  }); res.json(result);
}));
export default router;
