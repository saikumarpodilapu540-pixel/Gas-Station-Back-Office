import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint } from '../utils/http';
import { accessStore } from '../services/operations';
import { reportSummary } from '../services/reporting';
const router = Router(); router.use(requireAuth);
router.get('/summary', endpoint(async (req, res) => {
  const data = z.object({ storeId: z.string().uuid(), range: z.enum(['today','yesterday','7d','30d','all']).optional(), from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query);
  await accessStore(prisma, actorOf(req), data.storeId);
  res.json(await prisma.$transaction(tx => reportSummary(tx, data.storeId, data), { isolationLevel: 'RepeatableRead' }));
}));
export default router;
