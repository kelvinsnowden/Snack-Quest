import type { MachineAssortmentPromotionalState, SellableCatalogItem } from '@/types';

export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

export function cartKey(item: SellableCatalogItem): string {
  return `${item.productCatalogue}:${item.productId}`;
}

/** Longest a phone number typed on the keypad can be: 254 7XX XXX XXX. */
export const PHONE_MAX_DIGITS = 12;

/**
 * A Kenyan mobile number as a customer types it: 07XX/01XX (10 digits)
 * or 2547XX/2541XX (12). The server normalises and validates it again —
 * this only decides when the Pay button can be pressed.
 */
export function isCompletePhoneNumber(digits: string): boolean {
  return /^0[17]\d{8}$/.test(digits) || /^254[17]\d{8}$/.test(digits);
}

/** "0712345678" → "0712 345 678"; "254712345678" → "254 712 345 678". Partial input groups the same way. */
export function formatPhoneNumber(digits: string): string {
  if (digits.startsWith('254')) {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 12)].filter(Boolean).join(' ');
  }
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean).join(' ');
}

export const PROMO_LABEL: Record<MachineAssortmentPromotionalState, string | null> = {
  none: null,
  featured: 'Featured',
  new: 'New',
  limited_time: 'Limited time',
};
