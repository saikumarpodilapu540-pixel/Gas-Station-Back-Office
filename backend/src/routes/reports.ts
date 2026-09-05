import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);

router.get('/summary', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    
    const [sales, expenses, fuelLogs, lowStockItems] = await Promise.all([
      prisma.sale.findMany({
        where: { storeId },
        include: { saleItems: { include: { product: true } } }
      }),
      prisma.expense.aggregate({
        where: { storeId },
        _sum: { amount: true }
      }),
      prisma.fuelLog.aggregate({
        where: { storeId },
        _sum: { gallonsSold: true }
      }),
      prisma.inventory.findMany({ where: { storeId } })
    ]);

    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    const totalExpenses = Number(expenses._sum.amount || 0);
    const costOfGoodsSold = sales.reduce((sum, sale) => sum + sale.saleItems.reduce(
      (saleSum, item) => saleSum + Number(item.cost ?? item.product.costPrice) * item.quantity,
      0
    ), 0);
    const netProfit = totalRevenue - costOfGoodsSold - totalExpenses;

    const departments = new Map<string, { revenue: number; profit: number }>();
    for (const sale of sales) {
      for (const item of sale.saleItems) {
        const current = departments.get(item.product.category) || { revenue: 0, profit: 0 };
        const revenue = Number(item.price) * item.quantity;
        const cost = Number(item.cost ?? item.product.costPrice) * item.quantity;
        current.revenue += revenue;
        current.profit += revenue - cost;
        departments.set(item.product.category, current);
      }
    }

    res.json({
      totalRevenue,
      totalExpenses,
      costOfGoodsSold,
      netProfit,
      gallonsSold: Number(fuelLogs._sum.gallonsSold || 0),
      lowStockCount: lowStockItems.filter((item) => item.stockQuantity <= item.reorderLevel).length,
      departmentSales: Array.from(departments, ([name, values]) => ({ name, ...values }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
