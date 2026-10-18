import { describe, expect, it } from 'vitest';
import { currentVisit, riderFirstName, visitOf } from '@/lib/vending/restockVisit';
import type { RestockTask } from '@/types/restockTask';

const at = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() });
const NOW = new Date('2026-10-18T12:00:00Z');

function task(status: RestockTask['status'], extra: Partial<Record<string, unknown>> = {}): RestockTask {
  return {
    businessId: 'b',
    machineId: 'm',
    warehouseId: null,
    items: [
      { slotId: 'A1', productId: 'p', quantityNeeded: 4, quantityDispatched: null, quantityReceived: null, discrepancyQuantity: null, batchId: null, expiresAt: null },
      { slotId: 'A2', productId: 'p', quantityNeeded: 3, quantityDispatched: null, quantityReceived: null, discrepancyQuantity: null, batchId: null, expiresAt: null },
    ],
    status,
    priority: 'normal',
    pickedBy: null,
    pickedAt: null,
    dispatchedBy: null,
    dispatchedAt: null,
    receivedBy: null,
    completedAt: null,
    discrepancyNote: null,
    note: null,
    createdAt: at('2026-10-18T08:00:00Z'),
    updatedAt: at('2026-10-18T09:00:00Z'),
    createdBy: 'x',
    updatedBy: 'x',
    ...extra,
  } as unknown as RestockTask;
}

describe('restock visits for owners', () => {
  it('names the rider by first name only, never by email', () => {
    expect(riderFirstName('Otieno Kamau')).toBe('Otieno');
    expect(riderFirstName('rider@example.com')).toBeNull();
    expect(riderFirstName(null)).toBeNull();
  });

  it('says when the rider set off and with how many items', () => {
    expect(visitOf(task('in_transit', { inTransitAt: at('2026-10-18T10:30:00Z') }), 'Otieno Kamau', NOW)).toEqual({ stage: 'on_the_way', at: '2026-10-18T10:30:00.000Z', items: 7, riderFirstName: 'Otieno' });
  });

  it('shows a finished visit for a day, then nothing', () => {
    const received = (completed: string) =>
      task('partially_received', { completedAt: at(completed), items: [{ slotId: 'A1', productId: 'p', quantityNeeded: 4, quantityDispatched: 4, quantityReceived: 3, discrepancyQuantity: 1, batchId: null, expiresAt: null }] });
    expect(visitOf(received('2026-10-18T07:00:00Z'), null, NOW)).toMatchObject({ stage: 'restocked', items: 3, riderFirstName: null });
    expect(visitOf(received('2026-10-16T07:00:00Z'), null, NOW)).toBeNull();
    expect(visitOf(task('cancelled'), null, NOW)).toBeNull();
  });

  it('puts a rider on the way ahead of anything else', () => {
    const visit = currentVisit(
      [
        { task: task('received', { completedAt: at('2026-10-18T11:00:00Z') }), riderName: null },
        { task: task('draft'), riderName: null },
        { task: task('dispatched', { dispatchedAt: at('2026-10-18T11:30:00Z') }), riderName: 'Amina' },
      ],
      NOW,
    );
    expect(visit).toMatchObject({ stage: 'on_the_way', riderFirstName: 'Amina', at: '2026-10-18T11:30:00.000Z' });
    expect(currentVisit([], NOW)).toBeNull();
  });
});
