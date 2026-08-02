import { describe, expect, it } from 'vitest';
import { mapJumiaStatusToShipmentStatus } from '@/lib/delivery/jumiaStatusMapping';

describe('mapJumiaStatusToShipmentStatus', () => {
  it('maps known raw statuses to a ShipmentStatus, case-insensitively', () => {
    expect(mapJumiaStatusToShipmentStatus('in_transit')).toBe('in_transit');
    expect(mapJumiaStatusToShipmentStatus('OUT_FOR_DELIVERY')).toBe('in_transit');
    expect(mapJumiaStatusToShipmentStatus('  Delivered  ')).toBe('delivered');
    expect(mapJumiaStatusToShipmentStatus('failed')).toBe('failed');
    expect(mapJumiaStatusToShipmentStatus('returned')).toBe('failed');
    expect(mapJumiaStatusToShipmentStatus('cancelled')).toBe('failed');
  });

  it('returns null for an unrecognized raw status, never a guess', () => {
    expect(mapJumiaStatusToShipmentStatus('warehouse_scan')).toBeNull();
    expect(mapJumiaStatusToShipmentStatus('')).toBeNull();
  });
});
