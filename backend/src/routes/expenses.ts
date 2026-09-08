import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint, keyOf } from '../utils/http';
import { accessStore, audit, fail, manager, operate } from '../services/operations';
import { assertOpenDay } from '../services/reporting';
const router = Router(); router.use(requireAuth);
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json(await prisma.expense.findMany({ where: { storeId }, orderBy: { date: 'desc' }, take: 200 }));
}));
router.post('/', endpoint(async (req, res) => {
  const data = z.object({ storeId: z.string().uuid(), type: z.string().trim().min(2).max(100), amount: z.number().positive().max(9999999).multipleOf(0.01), date: z.iso.date() }).parse(req.body);
  res.status(201).json(await operate(actorOf(req), keyOf(req), { action: 'expense', data }, async (tx, op) => {
    manager(op.actor); const store = await accessStore(tx, op.actor, data.storeId);
    await assertOpenDay(tx, store.id, DateTime.fromISO(data.date, { zone: store.timezone }).toJSDate());
    const expense = await tx.expense.create({ data: { ...data, date: new Date(`${data.date}T00:00:00Z`) } });
    await audit(tx, op, store.id, 'Recorded expense', expense, 'Expenses'); return expense;
  }));
}));
router.delete('/:id', endpoint(async (req, res) => {
  const id = String(req.params.id); const reason = z.string().trim().min(3).max(500).parse(req.body.reason);
  res.json(await operate(actorOf(req), keyOf(req), { action: 'correct-expense', id, reason }, async (tx, op) => {
    manager(op.actor); const expense = await tx.expense.findUnique({ where: { id } }); if (!expense) return fail('Expense not found.',404);
    const store = await accessStore(tx, op.actor, expense.storeId);
    await assertOpenDay(tx, store.id, DateTime.fromISO(expense.date.toISOString().slice(0,10), { zone: store.timezone }).toJSDate());
    await tx.expense.delete({ where: { id } }); await audit(tx, op, store.id, 'Reversed expense entry', { expense, reason }, 'Expenses'); return { success: true };
  }));
}));
export default router;
