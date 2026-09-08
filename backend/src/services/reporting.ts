import { DateTime } from 'luxon';
import { D, fail, money, Tx } from './operations';
export type ReportPeriod = { range?: string; from?: string; to?: string };
export function periodFor(timezone: string, period: ReportPeriod, clock: DateTime<boolean> = DateTime.now()) {
  const now = clock.setZone(timezone);
  if (!now.isValid) return fail('Store timezone is invalid.');
  let start: DateTime | undefined, end: DateTime | undefined;
  if (period.from || period.to) {
    if (!period.from || !period.to) fail('Provide both from and to dates.');
    start = DateTime.fromISO(period.from!, { zone: timezone }).startOf('day');
    end = DateTime.fromISO(period.to!, { zone: timezone }).plus({ days: 1 }).startOf('day');
    if (!start.isValid || !end.isValid || start >= end) fail('Invalid report date range.');
  } else {
    switch (period.range || 'today') {
      case 'today': start = now.startOf('day'); end = now.endOf('day').plus({ milliseconds: 1 }); break;
      case 'yesterday': start = now.minus({ days: 1 }).startOf('day'); end = now.startOf('day'); break;
      case '7d': start = now.minus({ days: 6 }).startOf('day'); end = now.endOf('day').plus({ milliseconds: 1 }); break;
      case '30d': start = now.minus({ days: 29 }).startOf('day'); end = now.endOf('day').plus({ milliseconds: 1 }); break;
      case 'all': break;
      default: fail('Choose today, yesterday, 7d, 30d, all, or a date range.');
    }
  }
  return { timezone, from: start?.toISODate() || null, to: end?.minus({ days: 1 }).toISODate() || null,
    dateFilter: start && end ? { gte: start.toJSDate(), lt: end.toJSDate() } : undefined,
    expenseFilter: start && end ? { gte: new Date(`${start.toISODate()}T00:00:00Z`), lt: new Date(`${end.toISODate()}T00:00:00Z`) } : undefined };
}
export async function assertOpenDay(tx: Tx, storeId: string, at: Date) {
  const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
  const date = new Date(`${DateTime.fromJSDate(at).setZone(store.timezone).toISODate()}T00:00:00Z`);
  const close = await tx.dailyClosing.findUnique({ where: { storeId_date: { storeId, date } } });
  if (close?.status === 'CLOSED') fail('This business day is closed. An owner must reopen it before corrections.', 409);
}
export async function reportSummary(tx: Tx, storeId: string, options: ReportPeriod = {}) {
  const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
  const period = periodFor(store.timezone, options);
  const sales = await tx.sale.findMany({ where: { storeId, category: { not: 'fuel' }, ...(period.dateFilter ? { date: period.dateFilter } : {}) }, include: { saleItems: true } });
  const fuel = await tx.fuelLog.findMany({ where: { storeId, type: 'METER', ...(period.dateFilter ? { date: period.dateFilter } : {}) } });
  const expenses = await tx.expense.aggregate({ where: { storeId, ...(period.expenseFilter ? { date: period.expenseFilter } : {}) }, _sum: { amount: true } });
  const inventory = await tx.inventory.findMany({ where: { storeId, archivedAt: null }, include: { balances: { include: { package: true } } } });
  let storeRevenue = D(0), fuelRevenue = D(0), taxCollected = D(0), cost = D(0), gallons = D(0), missingCostLines = 0;
  const departments = new Map<string, { revenue: any; profit: any; tax: any; missing: number }>();
  const hours = Array.from({ length: 24 }, (_, h) => ({ time: `${String(h).padStart(2,'0')}:00`, sales: 0 }));
  for (const sale of sales) {
    storeRevenue = storeRevenue.plus(sale.subtotal); taxCollected = taxCollected.plus(sale.taxAmount);
    const hour = DateTime.fromJSDate(sale.date).setZone(store.timezone).hour;
    hours[hour].sales = Number(money(D(hours[hour].sales).plus(sale.subtotal)));
    for (const line of sale.saleItems) {
      const lineCost = D(line.cost || 0).mul(line.quantity); cost = cost.plus(lineCost);
      const missing = line.cost === null ? 1 : 0; missingCostLines += missing;
      const name = line.category || 'Uncategorized';
      const current = departments.get(name) || { revenue: D(0), profit: D(0), tax: D(0), missing: 0 };
      const revenue = D(line.price).mul(line.quantity);
      departments.set(name, { revenue: current.revenue.plus(revenue), profit: current.profit.plus(revenue.minus(lineCost)), tax: current.tax.plus(line.taxAmount), missing: current.missing + missing });
    }
  }
  for (const log of fuel) {
    const volume = D(log.gallonsSold || 0); gallons = gallons.plus(volume);
    fuelRevenue = fuelRevenue.plus(volume.mul(log.pricePerGallon || 0));
    cost = cost.plus(volume.mul(log.costPerGallon || 0));
    if (log.costPerGallon === null && volume.greaterThan(0)) missingCostLines++;
  }
  const revenue = storeRevenue.plus(fuelRevenue), totalExpenses = D(expenses._sum.amount || 0);
  return { storeId, storeName: store.name, timezone: store.timezone, range: options.range || (options.from ? 'custom' : 'today'), from: period.from, to: period.to, asOf: new Date().toISOString(),
    totalRevenue: Number(money(revenue)), storeRevenue: Number(money(storeRevenue)), fuelRevenue: Number(money(fuelRevenue)), totalExpenses: Number(money(totalExpenses)),
    taxCollected: Number(money(taxCollected)), costOfGoodsSold: Number(money(cost)), missingCostLines,
    netProfit: missingCostLines ? null : Number(money(revenue.minus(cost).minus(totalExpenses))),
    gallonsSold: Number(gallons), lowStockCount: inventory.filter(i => i.stockQuantity - i.balances.reduce((sum,b)=>sum+b.reserved*b.package.unitsPerPackage,0) <= i.reorderLevel).length,
    departmentSales: Array.from(departments, ([name, d]) => ({ name, revenue: Number(money(d.revenue)), profit: d.missing ? null : Number(money(d.profit)), tax: Number(money(d.tax)) })), hourlyTrends: hours };
}
