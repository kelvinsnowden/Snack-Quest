import { describe, expect, it } from 'vitest';
import { allergenLine, isValidBarcode, netContentLabel, parseProductDetails } from '@/lib/products/productDetails';

describe('product details', () => {
  it('accepts real GTINs and refuses a wrong check digit or length', () => {
    for (const code of ['4006381333931', '036000291452', '73513537', '10012345678902']) expect(isValidBarcode(code), code).toBe(true);
    for (const code of ['4006381333932', '036000291453', '1234567', '400638133393a', '']) expect(isValidBarcode(code), code).toBe(false);
  });

  it('keeps absent keys absent, clears with null or blank, and refuses bad values', () => {
    expect(parseProductDetails({})).toEqual({ details: {} });
    expect(parseProductDetails({ brand: '  Calbee ', barcode: '4006 3813 3393 1', allergens: ['soy', 'milk', 'soy'], netContent: { amount: 70, unit: 'g' } })).toEqual({
      details: { brand: 'Calbee', barcode: '4006381333931', allergens: ['soy', 'milk'], netContent: { amount: 70, unit: 'g' } },
    });
    expect(parseProductDetails({ brand: '', barcode: null, allergens: null, netContent: null })).toEqual({ details: { brand: null, barcode: null, allergens: null, netContent: null } });
    expect(parseProductDetails({ allergens: [] })).toEqual({ details: { allergens: [] } });
    for (const body of [{ barcode: '4006381333932' }, { allergens: ['peanut'] }, { allergens: 'milk' }, { netContent: { amount: 0, unit: 'g' } }, { netContent: { amount: 5, unit: 'kg' } }, { brand: 'x'.repeat(81) }]) {
      expect('error' in parseProductDetails(body as Record<string, unknown>), JSON.stringify(body)).toBe(true);
    }
  });

  it('never says "none" for allergens nobody recorded', () => {
    expect(allergenLine(undefined)).toBeNull();
    expect(allergenLine(null)).toBeNull();
    expect(allergenLine([])).toBe('No declared allergens.');
    expect(allergenLine(['milk', 'tree_nuts'])).toBe('Contains milk, tree nuts.');
    expect(netContentLabel({ amount: 1500, unit: 'ml' })).toBe('1,500 ml');
    expect(netContentLabel(null)).toBeNull();
  });
});
