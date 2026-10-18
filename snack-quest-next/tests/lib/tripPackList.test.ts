import { describe, expect, it } from 'vitest';
import { tripPackList } from '@/lib/vending/tripPackList';

const line = (slotCode: string, productId: string | null, name: string, quantity: number) => ({ slotCode, productId, name, imageUrl: null, quantity });

describe('tripPackList', () => {
  it('lists each product once with its total and how it splits between machines', () => {
    const { products, totalItems } = tripPackList([
      { machineId: 'm1', machineCode: 'SQ-1', lines: [line('A1', 'cola', 'Cola', 4), line('A2', 'cola', 'Cola', 2), line('B1', 'chips', 'Chips', 3)] },
      { machineId: 'm2', machineCode: 'SQ-2', lines: [line('A1', 'cola', 'Cola', 5), line('C1', null, 'Empty slot', 1), line('C2', 'gum', 'Gum', 0)] },
    ]);
    expect(totalItems).toBe(15);
    expect(products.map((product) => [product.name, product.quantity])).toEqual([
      ['Chips', 3],
      ['Cola', 11],
      ['Empty slot', 1],
    ]);
    expect(products.find((product) => product.key === 'cola')?.machines).toEqual([
      { machineId: 'm1', machineCode: 'SQ-1', quantity: 6, slots: ['A1', 'A2'] },
      { machineId: 'm2', machineCode: 'SQ-2', quantity: 5, slots: ['A1'] },
    ]);
  });

  it('is empty with nothing to pack', () => {
    expect(tripPackList([])).toEqual({ products: [], totalItems: 0 });
  });
});
