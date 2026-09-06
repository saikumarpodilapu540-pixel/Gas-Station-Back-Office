import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';
import { writeAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  storeId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(500),
  module: z.string().trim().min(1).max(100),
  oldValue: z.string().max(5000).optional().nullable(),
  newValue: z.string().max(5000).optional().nullable()
});

router.get('/', async (req, res) => {
  try {
    const storeId = (req.query.storeId as string) || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const where: any = { storeId };
    if (req.query.module) where.module = req.query.module;
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.date) {
      const start = new Date(`${req.query.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.timestamp = { gte: start, lt: end };
    }
    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      take: 500
    });
    res.json(logs.map((log) => ({
      ...log,
      user: log.user.name,
      userId: log.userId
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    const storeId = data.storeId || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const log = await writeAuditLog(prisma, {
      storeId,
      userId: (req as any).user.id,
      action: data.action,
      module: data.module,
      oldValue: data.oldValue,
      newValue: data.newValue
    });
    res.status(201).json(log);
  } catch (error: any) {
    const message = error?.name === 'ZodError'
      ? error.issues.map((issue: any) => issue.message).join(', ')
      : 'Failed to create audit log';
    res.status(400).json({ error: message });
  }
});

export default router;
