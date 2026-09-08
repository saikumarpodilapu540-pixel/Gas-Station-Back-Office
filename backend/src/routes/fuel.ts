import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, emitStore, endpoint, keyOf } from '../utils/http';
import { accessStore, audit, D, fail, manager, operate } from '../services/operations';
import { assertOpenDay, periodFor } from '../services/reporting';
const router = Router(); router.use(requireAuth);
const value = z.number().finite().min(0).max(10000000);
const tankSchema = z.object({ currentLevel: value.optional(), tankCapacity: value.positive().optional(), pricePerGallon: value.optional(), costPerGallon: value.optional(), expectedUpdatedAt: z.string().optional() });
const view = (t: any, totalSold = 0) => ({ ...t, type: t.fuelType, current: Number(t.currentLevel), capacity: Number(t.tankCapacity), price: Number(t.pricePerGallon), cost: Number(t.costPerGallon), totalSold });
router.get('/tanks', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  const tanks = await prisma.fuelTank.findMany({ where: { storeId }, orderBy: { fuelType: 'asc' } });
  const totals = await prisma.fuelLog.groupBy({ by: ['fuelType'], where: { storeId, type: 'METER' }, _sum: { gallonsSold: true } });
  res.json(tanks.map(t => view(t, Number(totals.find(x => x.fuelType === t.fuelType)?._sum.gallonsSold || 0))));
}));
router.post('/tanks', endpoint(async (req, res) => {
  const data = z.object({ storeId: z.string().uuid(), fuelType: z.string().trim().min(1).max(50), tankCapacity: value.positive(), currentLevel: value, pricePerGallon: value, costPerGallon: value }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'create-tank', data }, async (tx, op) => {
    manager(op.actor); await accessStore(tx, op.actor, data.storeId); if (data.currentLevel > data.tankCapacity) fail('Level exceeds capacity.');
    const tank = await tx.fuelTank.create({ data }); await audit(tx, op, data.storeId, 'Created fuel tank', tank, 'Fuel'); return tank;
  }); emitStore(req, data.storeId); res.status(201).json(view(result));
}));
router.put('/tanks/:id', endpoint(async (req, res) => {
  const id = String(req.params.id), data = tankSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'edit-tank', id, data }, async (tx, op) => {
    manager(op.actor); const tank = await tx.fuelTank.findUniqueOrThrow({ where: { id } }); await accessStore(tx, op.actor, tank.storeId);
    if (data.currentLevel !== undefined && data.expectedUpdatedAt && data.expectedUpdatedAt !== tank.updatedAt.toISOString()) fail('Tank level changed or the count is stale. Refresh and recount.',409);
    if ((data.currentLevel ?? Number(tank.currentLevel)) > (data.tankCapacity ?? Number(tank.tankCapacity))) fail('Level exceeds capacity.');
    const { expectedUpdatedAt: _, ...updates } = data;
    const updated = await tx.fuelTank.update({ where: { id }, data: updates }); await audit(tx, op, tank.storeId, 'Updated fuel tank', { before: tank, after: updated }, 'Fuel'); return updated;
  }); emitStore(req, result.storeId); res.json(view(result));
}));
router.post('/', endpoint(async (req, res) => {
  const data = z.object({ store_id: z.string().uuid(), fuel_type: z.string().trim().min(1), gallons_received: value.positive().optional(), date: z.iso.date().optional(),
    openingMeter: value.optional(), closingMeter: value.optional(), pricePerGallon: value.optional(), costPerGallon: value.optional() }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'fuel-log', data }, async (tx, op) => {
    manager(op.actor); const store = await accessStore(tx, op.actor, data.store_id);
    const at = data.date ? DateTime.fromISO(data.date, { zone: store.timezone }).set({ hour: 12 }).toJSDate() : new Date();
    await assertOpenDay(tx, store.id, at);
    const tank = await tx.fuelTank.findUnique({ where: { storeId_fuelType: { storeId: store.id, fuelType: data.fuel_type } } });
    if (!tank) return fail('Create a fuel tank with its capacity and costs before recording fuel.');
    let log;
    if (data.gallons_received !== undefined) {
      if (data.openingMeter !== undefined || data.closingMeter !== undefined) fail('Choose a delivery or a meter reading, not both.');
      if (D(tank.currentLevel).plus(data.gallons_received).greaterThan(tank.tankCapacity)) fail('Delivery exceeds tank capacity.');
      const deliveryCost = data.costPerGallon === undefined ? tank.costPerGallon : D(data.costPerGallon);
      const nextCost = D(tank.currentLevel).mul(tank.costPerGallon).plus(deliveryCost.mul(data.gallons_received)).div(D(tank.currentLevel).plus(data.gallons_received)).toDecimalPlaces(3);
      log = await tx.fuelLog.create({ data: { storeId: store.id, fuelType: tank.fuelType, type: 'DELIVERY', gallonsReceived: data.gallons_received, costPerGallon: deliveryCost, date: at } });
      await tx.fuelTank.update({ where: { id: tank.id }, data: { currentLevel: { increment: data.gallons_received }, costPerGallon: nextCost } });
    } else {
      if (data.openingMeter === undefined || data.closingMeter === undefined || data.pricePerGallon === undefined) fail('Opening meter, closing meter, and selling price are required.');
      const sold = D(data.closingMeter!).minus(data.openingMeter!);
      if (sold.lessThanOrEqualTo(0) || sold.greaterThan(tank.currentLevel)) fail('Gallons sold must be positive and cannot exceed the tank level.');
      const day = DateTime.fromJSDate(at).setZone(store.timezone).toISODate()!;
      const overlap = await tx.fuelLog.findFirst({ where: { storeId: store.id, fuelType: tank.fuelType, type: 'METER', date: periodFor(store.timezone, { from: day, to: day }).dateFilter,
        openingMeter: { lt: data.closingMeter }, closingMeter: { gt: data.openingMeter } } });
      if (overlap) fail('These meter readings overlap an existing reading for this day.',409);
      log = await tx.fuelLog.create({ data: { storeId: store.id, fuelType: tank.fuelType, type: 'METER', openingMeter: data.openingMeter, closingMeter: data.closingMeter,
        gallonsSold: sold, pricePerGallon: data.pricePerGallon, costPerGallon: tank.costPerGallon, date: at } });
      await tx.fuelTank.update({ where: { id: tank.id }, data: { currentLevel: { decrement: sold } } });
    }
    await audit(tx, op, store.id, 'Recorded fuel movement', log, 'Fuel'); return log;
  }); emitStore(req, data.store_id); res.status(201).json(result);
}));
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json(await prisma.fuelLog.findMany({ where: { storeId }, orderBy: { date: 'desc' }, take: 100 }));
}));
export default router;
