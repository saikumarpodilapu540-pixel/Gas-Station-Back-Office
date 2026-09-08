import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, endpoint } from '../utils/http';
import { accessStore, ownerFor, stockView } from '../services/operations';
import { reportSummary } from '../services/reporting';
import { transferMoney } from '../services/transfers';
const router = Router(); router.use(requireAuth);
const inputSchema = z.object({ message: z.string().trim().min(1).max(1000), storeId: z.string().uuid().optional() });
const number = (v: any) => Number(v || 0).toFixed(2);
function dayRange(tz: string, message: string) {
  const now = DateTime.now().setZone(tz); const m = message.toLowerCase();
  if (m.includes('yesterday')) return { from: now.minus({ days: 1 }).toISODate()!, to: now.minus({ days: 1 }).toISODate()!, label: 'yesterday' };
  if (m.includes('last 7') || m.includes('week')) return { range: '7d', label: 'the last 7 days' };
  if (m.includes('last 30') || m.includes('month')) return { range: '30d', label: 'the last 30 days' };
  return { range: 'today', label: 'today' };
}
router.post('/query', endpoint(async (req, res) => {
  const data = inputSchema.parse(req.body); const actor = actorOf(req);
  const storeId = data.storeId || actor.storeId; if (!storeId) return res.status(400).json({ error: 'Select one store first.' });
  const store = await accessStore(prisma, actor, storeId); const query = data.message.toLowerCase();
  const period = dayRange(store.timezone, query);
  // Specific intent checks run before broad words such as "today" or "inventory".
  if (query.includes('fuel') || query.includes('gallon')) {
    const report = await prisma.$transaction(tx => reportSummary(tx, storeId, period));
    return res.json({ answer: `Fuel sold for ${period.label} at ${store.name}: ${Number(report.gallonsSold).toFixed(1)} gallons. Fuel revenue was $${number(report.fuelRevenue)}.`, data: report, intent: 'fuel' });
  }
  if (query.includes('low stock') || query.includes('out of stock')) {
    const rows = await prisma.inventory.findMany({ where: { storeId, archivedAt: null }, include: { balances: { include: { package: true } }, catalog: { include: { packages: true } } }, orderBy: { productName: 'asc' } });
    const low = rows.map(stockView).filter(i => query.includes('out of stock') ? i.availableQuantity === 0 : i.availableQuantity <= i.reorderLevel);
    const list = low.slice(0, 10).map(i => `${i.productName} (${i.availableQuantity} base units)`).join(', ');
    return res.json({ answer: low.length ? `${low.length} item${low.length === 1 ? '' : 's'} need attention: ${list}.` : `No ${query.includes('out of stock') ? 'out-of-stock' : 'low-stock'} items at ${store.name}.`, data: { items: low }, intent: 'stock_alert' });
  }
  if (query.includes('transfer') || query.includes('check') || query.includes('owe') || query.includes('settlement')) {
    const ownerId = await ownerFor(prisma, actor);
    const transfers = await prisma.stockTransfer.findMany({ where: { ownerId, OR: [{ sourceStoreId: storeId }, { destinationStoreId: storeId }], status: { notIn: ['CANCELLED'] } }, include: { lines: true, receipts: true, allocations: { include: { settlement: true } } }, orderBy: { createdAt: 'desc' }, take: 10 });
    const open = transfers.map(transferMoney).filter(t => t.status !== 'RECEIVED' || Number(t.outstanding) > 0);
    const answer = open.length ? open.slice(0, 5).map(t => `${t.number} is ${t.status.toLowerCase()} with $${number(t.outstanding)} outstanding`).join('; ') : `No open transfers or check balances for ${store.name}.`;
    return res.json({ answer, data: open, intent: 'transfers' });
  }
  if (query.includes('inventory') || query.includes('stock') || query.includes('pack') || query.includes('bottle') || query.includes('case')) {
    const words = query.replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['what','how','many','have','stock','inventory','the','for','today','loose','bottles','packs','cases'].includes(w));
    const rows = await prisma.inventory.findMany({ where: { storeId, archivedAt: null, ...(words.length ? { OR: words.map(w => ({ productName: { contains: w, mode: 'insensitive' as const } })) } : {}) }, include: { balances: { include: { package: true } }, catalog: { include: { packages: true } } }, take: 10, orderBy: { productName: 'asc' } });
    if (!rows.length) return res.json({ answer: 'I could not find that product in the selected store. Try the product name or SKU.', data: [], intent: 'inventory' });
    const answer = rows.map(i => { const s = stockView(i); const balances = i.balances.filter(b => b.quantity).map(b => `${b.quantity} ${b.package.name.toLowerCase()} in ${b.location.toLowerCase()}`).join(', '); return `${i.productName}: ${balances || 'no package stock'} (${s.availableQuantity} base units total)`; }).join('; ');
    return res.json({ answer, data: rows.map(stockView), intent: 'inventory' });
  }
  if (query.includes('profit') || query.includes('revenue') || query.includes('sales') || query.includes('tax')) {
    const report = await prisma.$transaction(tx => reportSummary(tx, storeId, period));
    const profit = report.netProfit === null ? 'unavailable because some costs are missing' : `$${number(report.netProfit)}`;
    return res.json({ answer: `For ${period.label} at ${store.name}, revenue was $${number(report.totalRevenue)}, cost of goods was $${number(report.costOfGoodsSold)}, expenses were $${number(report.totalExpenses)}, and net profit was ${profit}.`, data: report, intent: 'report' });
  }
  if (query.startsWith('add ') || query.includes('record ') || query.includes('transfer ')) return res.json({ answer: 'I can prepare operational data, but changes require a review screen and confirmation. Use Inventory, Transfers, or the Sales Terminal to post the transaction.', intent: 'confirmation_required' });
  res.json({ answer: 'Ask me about fuel sold, revenue or profit, low stock, a product’s packs and loose units, transfer status, or outstanding checks. Include a store when you manage more than one location.', intent: 'help' });
}));
export default router;
