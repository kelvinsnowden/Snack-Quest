import { describe, expect, it } from 'vitest';
import { allocateEqualSplit } from '@/lib/fulfillmentBatches/allocation';

function sum(allocations: Record<string, number>): number {
  return Object.values(allocations).reduce((total, value) => total + value, 0);
}

describe('allocateEqualSplit', () => {
  it('splits evenly when the total divides cleanly', () => {
    const result = allocateEqualSplit(6000, ['a', 'b', 'c', 'd', 'e']);
    expect(result).toEqual({ a: 1200, b: 1200, c: 1200, d: 1200, e: 1200 });
    expect(sum(result)).toBe(6000);
  });

  it('gives the remainder to the first orders in selection order, never inventing or dropping a shilling', () => {
    const result = allocateEqualSplit(6001, ['a', 'b', 'c', 'd', 'e']);
    expect(result).toEqual({ a: 1201, b: 1200, c: 1200, d: 1200, e: 1200 });
    expect(sum(result)).toBe(6001);
  });

  it('handles a remainder smaller than any order paying an extra shilling', () => {
    const result = allocateEqualSplit(1, ['a', 'b', 'c']);
    expect(result).toEqual({ a: 1, b: 0, c: 0 });
    expect(sum(result)).toBe(1);
  });

  it('handles a single order absorbing the whole cost', () => {
    const result = allocateEqualSplit(6000, ['a']);
    expect(result).toEqual({ a: 6000 });
  });

  it('handles a zero total', () => {
    const result = allocateEqualSplit(0, ['a', 'b', 'c']);
    expect(result).toEqual({ a: 0, b: 0, c: 0 });
    expect(sum(result)).toBe(0);
  });

  it('sums exactly for a large, awkward remainder', () => {
    const result = allocateEqualSplit(10007, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(sum(result)).toBe(10007);
    // 10007 / 7 = 1429.57..., base 1429, remainder 4
    expect(result).toEqual({ a: 1430, b: 1430, c: 1430, d: 1430, e: 1429, f: 1429, g: 1429 });
  });
});
