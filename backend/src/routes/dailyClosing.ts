import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { calculateProfit } from '../utils/businessLogic';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { storeId, date, totalSales, totalExpenses } = req.body;
    if (!storeId || !date) return res.status(400).json({ error: 'storeId and date are required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    
    // Dynamic profit calculation
    const netProfit = calculateProfit(Number(totalSales), Number(totalExpenses));

    const closing = await prisma.dailyClosing.upsert({
      where: {
        storeId_date: {
          storeId,
          date: new Date(date)
        }
      },
      update: {
        totalSales,
        totalExpenses,
        netProfit
      },
      create: {
        storeId,
        date: new Date(date),
        totalSales,
        totalExpenses,
        netProfit
      }
    });

    res.status(201).json(closing);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to process daily closing' });
  }
});

router.get('/', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const closings = await prisma.dailyClosing.findMany({
      where: { storeId },
      orderBy: { date: 'desc' },
      take: 30
    });
    res.json(closings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch closings' });
  }
});

export default router;
