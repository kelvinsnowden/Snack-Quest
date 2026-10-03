import { describe, expect, it } from 'vitest';
import { findSlotMappingConflicts, manufacturerSlotIdFor, resolveSlotCode } from '@/lib/vending/slotMapping';

const slots = [
  { slotCode: 'A01', manufacturerSlotId: 'spiral_01' },
  { slotCode: 'A02', manufacturerSlotId: 'spiral_02' },
  { slotCode: 'B01', manufacturerSlotId: null },
];

describe('slot mapping', () => {
  it('translates a manufacturer slot name to the Snack Quest slot code', () => {
    expect(resolveSlotCode(slots, 'spiral_02')).toBe('A02');
  });

  it('uses identity for slots with no explicit mapping', () => {
    expect(resolveSlotCode(slots, 'B01')).toBe('B01');
    expect(manufacturerSlotIdFor(slots[2])).toBe('B01');
  });

  it('never resolves a mapped slot by its Snack Quest code — the vendor calls it something else', () => {
    expect(resolveSlotCode(slots, 'A01')).toBeNull();
  });

  it('returns null for a name nothing maps to', () => {
    expect(resolveSlotCode(slots, 'spiral_99')).toBeNull();
  });

  it('detects two slots claiming the same manufacturer name', () => {
    expect(findSlotMappingConflicts([...slots, { slotCode: 'C01', manufacturerSlotId: 'spiral_01' }])).toHaveLength(1);
    // An explicit mapping colliding with another slot's identity name is also ambiguous.
    expect(findSlotMappingConflicts([...slots, { slotCode: 'C02', manufacturerSlotId: 'B01' }])).toHaveLength(1);
    expect(findSlotMappingConflicts(slots)).toEqual([]);
  });
});
