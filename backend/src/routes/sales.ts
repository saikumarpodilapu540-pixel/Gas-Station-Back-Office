import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, emitStore, endpoint, keyOf } from '../utils/http';
import { accessStore, operate } from '../services/operations';
import { createSale, saleSchema } from '../services/sales';
const router = Router(); router.use(requireAuth);
router.post('/', endpoint(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'sale', data }, (tx, op) => createSale(tx, op, data));
  emitStore(req, data.storeId); res.status(201).json(result);
}));
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  const take = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.take);
  const skip = z.coerce.number().int().min(0).default(0).parse(req.query.skip);
  res.json(await prisma.sale.findMany({ where: { storeId }, include: { saleItems: { include: { product: true } } }, orderBy: { date: 'desc' }, take, skip }));
}));
export default router;
