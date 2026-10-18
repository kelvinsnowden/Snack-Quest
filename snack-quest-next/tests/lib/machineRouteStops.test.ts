import { describe, expect, it } from 'vitest';
import { machineRouteStops } from '@/lib/vending/machineRouteStops';
import type { Location, Machine } from '@/types';

const machine = (id: string, extra: Partial<Machine>) => ({ id, data: { machineCode: id.toUpperCase(), locationId: null, latitude: null, longitude: null, address: null, venueName: null, ...extra } as unknown as Machine });
const location = (id: string, extra: Partial<Location>) => ({ id, data: { name: 'Strathmore', address: 'Ole Sangale Rd', latitude: -1.3095, longitude: 36.8148, ...extra } as unknown as Location });

describe('machineRouteStops', () => {
  it('uses the machine’s own position, else its location’s, and lists machines with neither', () => {
    const { stops, missing } = machineRouteStops(
      [machine('a', { latitude: -1.28, longitude: 36.82 }), machine('b', { locationId: 'loc' }), machine('c', {}), machine('d', { latitude: 0, longitude: 0 })],
      [location('loc', {})],
      (id) => (id === 'b' ? '4 items to load' : null),
    );
    expect(stops.map((stop) => [stop.id, stop.latitude])).toEqual([
      ['a', -1.28],
      ['b', -1.3095],
    ]);
    expect(stops[1]).toMatchObject({ label: 'B · Strathmore', detail: 'Ole Sangale Rd · 4 items to load' });
    expect(missing).toEqual(['C', 'D']);
  });
});
