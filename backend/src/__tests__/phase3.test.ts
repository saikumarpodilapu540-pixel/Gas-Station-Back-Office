import { DateTime } from 'luxon';
import { saleSchema } from '../services/sales';
import { transferMoney } from '../services/transfers';
import { periodFor } from '../services/reporting';

describe('Phase 3 inventory and transfer rules', () => {
  it('builds report boundaries in the store timezone', () => {
    const clock = DateTime.now().setZone('UTC').set({ year: 2026, month: 9, day: 6, hour: 1, minute: 30, second: 0, millisecond: 0 });
    const period = periodFor('America/Chicago', { range: 'today' }, clock);
    expect(period.from).toBe('2026-09-05');
    expect(period.to).toBe('2026-09-05');
    expect(period.dateFilter?.gte.toISOString()).toBe('2026-09-05T05:00:00.000Z');
  });

  it('calculates cost credits and outstanding check balances', () => {
    const result = transferMoney({
      totalCost: '90.00',
      lines: [{ unitCost: '1.25', unitsPerPackage: 24, returned: 1, returnedAfterReceipt: 0, damaged: 0 }],
      allocations: [
        { amount: '20.00', settlement: { status: 'ISSUED' } },
        { amount: '10.00', settlement: { status: 'CLEARED' } }
      ]
    });
    expect(Number(result.credit)).toBe(30);
    expect(Number(result.amountDue)).toBe(60);
    expect(Number(result.pendingAmount)).toBe(20);
    expect(Number(result.outstanding)).toBe(50);
    expect(Number(result.unallocated)).toBe(30);
  });

  it('keeps the sales terminal compatible while defaulting to loose units', () => {
    const parsed = saleSchema.parse({
      storeId: '11111111-1111-4111-8111-111111111111', paymentType: 'CASH',
      items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 2 }]
    });
    expect(parsed.items[0].location).toBe('BACKROOM');
    expect(parsed.items[0].packageId).toBeUndefined();
  });
});
