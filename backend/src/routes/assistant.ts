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
  const now = DateTime.now().setZone(tz), m = message.toLowerCase();
  const dates = m.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (dates?.length) return { from: dates[0], to: dates[1] || dates[0], label: dates.length > 1 ? `${dates[0]} through ${dates[1]}` : dates[0] };
  if (m.includes('yesterday')) return { from: now.minus({ days: 1 }).toISODate()!, to: now.minus({ days: 1 }).toISODate()!, label: 'yesterday' };
  if (/\b(last|this) month\b/.test(m)) {
    const month = m.includes('last month') ? now.minus({ months: 1 }) : now;
    return { from: month.startOf('month').toISODate()!, to: m.includes('last month') ? month.endOf('month').toISODate()! : now.toISODate()!, label: m.includes('last month') ? 'last calendar month' : 'this month to date' };
  }
  if (/\b(last|this) week\b/.test(m)) {
    const week = m.includes('last week') ? now.minus({ weeks: 1 }) : now;
    return { from: week.startOf('week').toISODate()!, to: m.includes('last week') ? week.endOf('week').toISODate()! : now.toISODate()!, label: m.includes('last week') ? 'last calendar week' : 'this week to date' };
  }
  if (m.includes('last 7')) return { range: '7d', label: 'the last 7 days' };
  if (m.includes('last 30')) return { range: '30d', label: 'the last 30 days' };
  if (m.includes('all time')) return { range: 'all', label: 'all recorded dates' };
  return { range: 'today', label: 'today' };
}
router.post('/query', endpoint(async (req, res) => {
  const data = inputSchema.parse(req.body); const actor = actorOf(req);
  const storeId = data.storeId || actor.storeId; if (!storeId) return res.status(400).json({ error: 'Select one store first.' });
  const store = await accessStore(prisma, actor, storeId); const query = data.message.toLowerCase();
  const period = dayRange(store.timezone, query);
  if (/^(add|record|delete|remove|post|approve|move|transfer|receive)\b/.test(query)) return res.json({ answer: 'Use Purchases & Invoice Inbox to receive a delivery (with or without a receipt), Inventory to open packs or move stock, and Transfers to send stock between stores. I only read records; these actions need the appropriate form.', intent: 'confirmation_required' });
  if (/\b(invoice|invoices|purchase|purchases|receipt|receipts)\b/.test(query)) {
    const [pending, posted] = await Promise.all([
      prisma.invoiceDocument.count({ where: { storeId, status: { not: 'POSTED' } } }),
      prisma.purchase.findMany({ where: { storeId, status: 'POSTED' }, include: { vendor: true }, orderBy: { createdAt: 'desc' }, take: 5 })
    ]);
    return res.json({ answer: `${store.name} has ${pending} invoice(s) awaiting review. Most recently recorded purchases: ${posted.length ? posted.map(p => `${p.invoiceNumber || 'legacy receipt'} from ${p.vendor.name}, $${number(p.totalCost)} on ${p.date.toISOString().slice(0,10)}`).join('; ') : 'none'}. Uploading a document does not receive stock. Review and post it in Purchases & Invoice Inbox; use Purchase without receipt when paperwork is missing.`, data: { pending, purchases: posted }, intent: 'purchases' });
  }
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
  if (query.includes('transfer') || /\b(checks|cheques|check balance|check number|outstanding check|uncleared check)\b/.test(query) || query.includes('owe') || query.includes('settlement')) {
    const ownerId = await ownerFor(prisma, actor);
    const transfers = await prisma.stockTransfer.findMany({ where: { ownerId, OR: [{ sourceStoreId: storeId }, { destinationStoreId: storeId }], status: { notIn: ['CANCELLED'] } }, include: { lines: true, receipts: true, allocations: { include: { settlement: true } } }, orderBy: { createdAt: 'desc' }, take: 10 });
    const open = transfers.map(transferMoney).filter(t => t.status !== 'RECEIVED' || Number(t.outstanding) > 0);
    const answer = open.length ? open.slice(0, 5).map(t => `${t.number} is ${t.status.toLowerCase()} with $${number(t.outstanding)} outstanding`).join('; ') : `No open transfers or check balances for ${store.name}.`;
    return res.json({ answer, data: open, intent: 'transfers' });
  }
  if (query.includes('sku') || query.includes('inventory') || query.includes('stock') || query.includes('pack') || query.includes('bottle') || query.includes('case')) {
    const words = query.replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['what','how','many','have','stock','inventory','the','for','today','loose','bottles','packs','cases','pack','bottle','case','check','show','please','our','available','there','does','that','this','sku'].includes(w));
    const rows = await prisma.inventory.findMany({ where: { storeId, archivedAt: null, ...(words.length ? { OR: words.flatMap(w => [{ productName: { contains: w, mode: 'insensitive' as const } }, { sku: { contains: w, mode: 'insensitive' as const } }]) } : {}) }, include: { balances: { include: { package: true } }, catalog: { include: { packages: true } } }, take: 10, orderBy: { productName: 'asc' } });
    if (!rows.length) return res.json({ answer: 'I could not find that product in the selected store. Try the product name or SKU.', data: [], intent: 'inventory' });
    const answer = rows.map(i => { const s = stockView(i); const balances = i.balances.filter(b => b.quantity).map(b => `${b.quantity} ${b.package.name.toLowerCase()} in ${b.location.toLowerCase()} (${b.reserved} reserved)`).join(', '); return `${i.productName}: ${balances || 'no package stock'} (${i.stockQuantity} base units on hand; ${s.availableQuantity} available)`; }).join('; ');
    return res.json({ answer: `${answer}${rows.length === 10 ? '. Showing up to 10 matching products; narrow the name or SKU for more detail.' : ''}`, data: rows.map(stockView), intent: 'inventory' });
  }
  if (query.includes('profit') || query.includes('revenue') || query.includes('sales') || query.includes('tax')) {
    const report = await prisma.$transaction(tx => reportSummary(tx, storeId, period));
    const profit = report.netProfit === null ? 'unavailable because some costs are missing' : `$${number(report.netProfit)}`;
    return res.json({ answer: `For ${period.label} at ${store.name}, revenue was $${number(report.totalRevenue)}, cost of goods was $${number(report.costOfGoodsSold)}, expenses were $${number(report.totalExpenses)}, and net profit was ${profit}.`, data: report, intent: 'report' });
  }
    res.json({ answer: 'Ask me about fuel sold, revenue or profit, low stock, a product’s packs and loose units, transfer status, or outstanding checks. Include a store when you manage more than one location.', intent: 'help' });
}));
export default router;
