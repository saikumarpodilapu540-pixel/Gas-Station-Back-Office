import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);
const fuelLogSchema = z.object({
  store_id: z.string().uuid(),
  fuel_type: z.string(),
  gallons_received: z.number().positive().optional(),
  date: z.string().optional(),
  openingMeter: z.number().nonnegative().optional(),
  closingMeter: z.number().nonnegative().optional(),
  pricePerGallon: z.number().positive().optional()
});

const tankUpdateSchema = z.object({
  currentLevel: z.coerce.number().min(0).optional(),
  tankCapacity: z.coerce.number().positive().optional(),
  pricePerGallon: z.coerce.number().min(0).optional(),
  costPerGallon: z.coerce.number().min(0).optional()
});

const toTankView = (tank: any, totalSold = 0) => ({
  id: tank.id,
  type: tank.fuelType,
  fuelType: tank.fuelType,
  current: Number(tank.currentLevel),
  currentLevel: Number(tank.currentLevel),
  capacity: Number(tank.tankCapacity),
  tankCapacity: Number(tank.tankCapacity),
  price: Number(tank.pricePerGallon || 0),
  cost: Number(tank.costPerGallon || 0),
  totalSold: Number(totalSold),
  updatedAt: tank.updatedAt
});

// Fuel tanks are created by the first delivery if the store has no tanks yet.
router.get('/tanks', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const [tanks, soldByFuel] = await Promise.all([
      prisma.fuelTank.findMany({ where: { storeId }, orderBy: { fuelType: 'asc' } }),
      prisma.fuelLog.groupBy({
        by: ['fuelType'],
        where: { storeId, type: 'METER' },
        _sum: { gallonsSold: true }
      })
    ]);
    const totals = new Map(soldByFuel.map((entry) => [entry.fuelType, Number(entry._sum.gallonsSold || 0)]));
    res.json(tanks.map((tank) => toTankView(tank, totals.get(tank.fuelType) || 0)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fuel tanks' });
  }
});

router.put('/tanks/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const updates = tankUpdateSchema.parse(req.body);
    const tank = await prisma.fuelTank.findUnique({ where: { id: String(req.params.id) } });
    if (!tank) return res.status(404).json({ error: 'Fuel tank not found' });
    if (!(await canAccessStore((req as any).user.id, tank.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const capacity = updates.tankCapacity ?? Number(tank.tankCapacity);
    const currentLevel = updates.currentLevel ?? Number(tank.currentLevel);
    if (currentLevel > capacity) return res.status(400).json({ error: 'Current level cannot exceed tank capacity' });
    const updated = await prisma.fuelTank.update({
      where: { id: tank.id },
      data: {
        ...(updates.currentLevel !== undefined ? { currentLevel: updates.currentLevel } : {}),
        ...(updates.tankCapacity !== undefined ? { tankCapacity: updates.tankCapacity } : {}),
        ...(updates.pricePerGallon !== undefined ? { pricePerGallon: updates.pricePerGallon } : {}),
        ...(updates.costPerGallon !== undefined ? { costPerGallon: updates.costPerGallon } : {})
      }
    });
    res.json(toTankView(updated));
  } catch (error: any) {
    res.status(400).json({ error: error?.name === 'ZodError' ? error.issues.map((issue: any) => issue.message).join(', ') : 'Failed to update fuel tank' });
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const validatedData = fuelLogSchema.parse(req.body);
    const { store_id, fuel_type, gallons_received, date, openingMeter, closingMeter, pricePerGallon } = validatedData;
    if (!(await canAccessStore((req as any).user.id, store_id))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    
    const result = await prisma.$transaction(async (tx) => {
      // Find relevant tank
      const tanks = await tx.fuelTank.findMany({ where: { storeId: store_id, fuelType: fuel_type } });
      let tank = tanks[0];
      
      // If tank doesn't exist, create it dynamically for simulation purposes
      if (!tank) {
        tank = await tx.fuelTank.create({
          data: { storeId: store_id, fuelType: fuel_type, tankCapacity: 10000, currentLevel: 0, pricePerGallon: 0, costPerGallon: 0 }
        });
      }

      if (gallons_received) {
        // Handle Delivery
        if (Number(tank.currentLevel) + Number(gallons_received) > Number(tank.tankCapacity)) {
          throw new Error('Fuel delivery exceeds the tank capacity');
        }
        const fuelLog = await tx.fuelLog.create({
          data: { 
            storeId: store_id, 
            fuelType: fuel_type, 
            type: 'DELIVERY',
            gallonsReceived: gallons_received,
            date: date ? new Date(date) : new Date()
          }
        });

        await tx.fuelTank.update({
          where: { id: tank.id },
          data: { currentLevel: Number(tank.currentLevel) + Number(gallons_received) }
        });

        return fuelLog;
      } else if (openingMeter !== undefined && closingMeter !== undefined && pricePerGallon !== undefined) {
        // Handle Meter Sale
        const gallonsSold = closingMeter - openingMeter;
        if (gallonsSold < 0) throw new Error("Closing meter must be >= opening meter");
        if (gallonsSold > Number(tank.currentLevel)) throw new Error('Fuel sold cannot exceed the current tank level');

        const fuelLog = await tx.fuelLog.create({
          data: { 
            storeId: store_id, 
            fuelType: fuel_type,
            type: 'METER',
            openingMeter, 
            closingMeter, 
            gallonsSold, 
            pricePerGallon 
          }
        });

        await tx.fuelTank.update({
          where: { id: tank.id },
          data: { currentLevel: Number(tank.currentLevel) - Number(gallonsSold) }
        });

        return fuelLog;
      } else {
        throw new Error("Invalid payload: must provide either delivery or meter data");
      }
    });

    const io = req.app.get('io');
    if (io) io.to(`store-${store_id}`).emit('fuel_updated', { storeId: store_id, data: result });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record fuel log' });
  }
});

router.get('/', async (req, res) => {
  try {
    const storeId = req.query.storeId as string || (req as any).user.storeId;
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    if (!(await canAccessStore((req as any).user.id, storeId))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const logs = await prisma.fuelLog.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 30 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fuel logs' });
  }
});

export default router;
