import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);
const fuelLogSchema = z.object({
  store_id: z.string(),
  fuel_type: z.string(),
  gallons_received: z.number().positive().optional(),
  date: z.string().optional(),
  openingMeter: z.number().nonnegative().optional(),
  closingMeter: z.number().nonnegative().optional(),
  pricePerGallon: z.number().positive().optional()
});

router.post('/', async (req, res) => {
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
          data: { storeId: store_id, fuelType: fuel_type, tankCapacity: 10000, currentLevel: 0 }
        });
      }

      if (gallons_received) {
        // Handle Delivery
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
