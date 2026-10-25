import { describe, expect, it, vi } from 'vitest';

const listRange = vi.hoisted(() => vi.fn(async () => new Map([['2026-10-01', { date: '2026-10-01' }]])));
const listByPartner = vi.hoisted(() => vi.fn(async () => [{ id: 'm1', data: { machineCode: 'SQ-1' } }]));
vi.mock('@/repositories/machineDailySummaryRepository', () => ({ machineDailySummaryRepository: { listRange } }));
vi.mock('@/repositories/machineRepository', () => ({ machineRepository: { listByPartner } }));
vi.mock('@/repositories/partnerRepository', () => ({ partnerRepository: { findById: vi.fn(async () => ({ name: 'Amina' })) } }));

import { forRender } from '@/lib/cache/forRender';
import { sharedFor } from '@/lib/cache/sharedFor';

describe('page read caches', () => {
  it('outside a Next server, a shared figure is simply read', async () => {
    const read = vi.fn(async (businessId: string) => `value for ${businessId}`);
    const cached = sharedFor(['test-figure'], 60, read);
    expect(await cached('biz-1')).toBe('value for biz-1');
    expect(await cached('biz-1')).toBe('value for biz-1');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('outside a page render, every call reads afresh and gets its own copy', async () => {
    const first = await forRender.partnerMachines('biz-1', 'p1');
    first.push({ id: 'extra', data: { machineCode: 'X' } } as never);
    const second = await forRender.partnerMachines('biz-1', 'p1');
    expect(second).toHaveLength(1);
    expect(listByPartner).toHaveBeenCalledTimes(2);

    const days = await forRender.dailySummaries('biz-1', 'm1', '2026-10-01', '2026-10-30');
    days.delete('2026-10-01');
    expect((await forRender.dailySummaries('biz-1', 'm1', '2026-10-01', '2026-10-30')).size).toBe(1);
  });
});
