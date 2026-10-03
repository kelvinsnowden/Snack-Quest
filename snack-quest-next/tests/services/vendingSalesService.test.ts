import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { vendingSalesService, nairobiDayRange, csvCell, SalesFilterError } from '@/services/vendingSalesService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * The fleet-wide sales list and its CSV. What matters: filters mean what
 * a person in Nairobi means by them (a "day" is a Nairobi day), a machine
 * code that matches nothing says so, the export can't carry spreadsheet
 * formulas, and one business never sees another's sales.
 */

const BUSINESS_ID = 'biz-sales-list';
const OTHER_BUSINESS_ID = 'biz-sales-list-other';

async function clean() {
  for (const businessId of [BUSINESS_ID, OTHER_BUSINESS_ID]) {
    for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'deviceCredentials', 'snackItems']) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
  }
}
beforeEach(clean);
afterEach(clean);

describe('nairobiDayRange', () => {
  it('turns Nairobi calendar days into instants: a Nairobi day starts at 21:00 UTC the day before', () => {
    const { since, until } = nairobiDayRange('2026-09-01', '2026-09-01');
    expect(since?.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(until?.toISOString()).toBe('2026-09-01T21:00:00.000Z');
  });

  it('refuses dates that are not dates, and a start after the end', () => {
    expect(() => nairobiDayRange('01/09/2026')).toThrow(SalesFilterError);
    expect(() => nairobiDayRange('2026-02-30')).toThrow(SalesFilterError);
    expect(() => nairobiDayRange('2026-09-02', '2026-09-01')).toThrow(/after the end/);
  });
});

describe('csvCell', () => {
  it('quotes what needs quoting and never lets a cell run as a spreadsheet formula', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+254700000000')).toBe("'+254700000000");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
});

describe('vendingSalesService', () => {
  async function machineWithSales(businessId: string, code: string, createdAt: string[]) {
    const { machineId } = await machineService.provisionDevice({ businessId, machineCode: code, serialNumber: `SN-${code}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    const productId = await snackItemRepository.create(
      { businessId, name: 'Honey Butter Chips', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    await new MachineSlotService(() => adapter).configureSlot({ businessId, machineId, slotCode: 'A01', productId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    const transactions = new MachineTransactionService(() => adapter);
    const ids: string[] = [];
    for (const at of createdAt) {
      const { id } = await transactions.createPending({ businessId, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await transactions.markPaymentVerified(businessId, id, `R${ids.length}${Date.now() % 100000}XY`);
      await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: Timestamp.fromDate(new Date(at)) });
      ids.push(id);
    }
    return { machineId, ids };
  }

  it('filters by Nairobi day and machine code, and names the product', async () => {
    // 22:30 UTC on 1 Sep is 01:30 on 2 Sep in Nairobi.
    const a = await machineWithSales(BUSINESS_ID, 'SQ-LIST-A', ['2026-09-01T10:00:00Z', '2026-09-01T22:30:00Z']);
    await machineWithSales(BUSINESS_ID, 'SQ-LIST-B', ['2026-09-01T10:00:00Z']);

    const firstSeptember = await vendingSalesService.list(BUSINESS_ID, { from: '2026-09-01', to: '2026-09-01' });
    expect(firstSeptember.rows).toHaveLength(2);
    const secondSeptember = await vendingSalesService.list(BUSINESS_ID, { from: '2026-09-02', to: '2026-09-02' });
    expect(secondSeptember.rows.map((row) => row.id)).toEqual([a.ids[1]]);

    const machineA = await vendingSalesService.list(BUSINESS_ID, { machineCode: 'sq-list-a' });
    expect(machineA.rows.map((row) => row.id).sort()).toEqual([...a.ids].sort());
    expect(machineA.rows[0]).toMatchObject({ machineCode: 'SQ-LIST-A', productName: 'Honey Butter Chips' });

    const unknown = await vendingSalesService.list(BUSINESS_ID, { machineCode: 'SQ-NOPE' });
    expect(unknown).toMatchObject({ rows: [], unknownMachineCode: 'SQ-NOPE' });

    const paidOnly = await vendingSalesService.list(BUSINESS_ID, { status: 'paid' });
    expect(paidOnly.rows).toHaveLength(3);
    expect((await vendingSalesService.list(BUSINESS_ID, { status: 'refunded' })).rows).toHaveLength(0);
  });

  it('pages through with a cursor, and never shows another business’s sales or machine', async () => {
    await machineWithSales(BUSINESS_ID, 'SQ-LIST-PAGE', ['2026-09-03T08:00:00Z', '2026-09-03T09:00:00Z', '2026-09-03T10:00:00Z']);
    await machineWithSales(OTHER_BUSINESS_ID, 'SQ-LIST-THEIRS', ['2026-09-03T11:00:00Z']);

    const first = await vendingSalesService.list(BUSINESS_ID, {}, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await vendingSalesService.list(BUSINESS_ID, {}, { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    expect((await vendingSalesService.list(BUSINESS_ID, { machineCode: 'SQ-LIST-THEIRS' })).unknownMachineCode).toBe('SQ-LIST-THEIRS');
  });

  it('exports the filtered sales as CSV in Nairobi time', async () => {
    await machineWithSales(BUSINESS_ID, 'SQ-LIST-CSV', ['2026-09-01T22:30:00Z']);
    const { csv, rowCount, truncated } = await vendingSalesService.exportCsv(BUSINESS_ID, {});
    expect(rowCount).toBe(1);
    expect(truncated).toBe(false);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe('Date (Nairobi),Sale reference,Machine,Slot,Product,Amount (KES),Status,Payment method,M-Pesa receipt,Delivered at (Nairobi),Reason');
    expect(row).toMatch(/^2026-09-02 01:30,/);
    expect(row).toContain(',SQ-LIST-CSV,A01,Honey Butter Chips,250,Paid — dispensing,mpesa,');
  });
});
