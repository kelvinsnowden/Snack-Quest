import type { PartnerPaymentAccountView } from '@/types';

/** "Till 5123456" or "Paybill 247247" — how an owner's till is named everywhere it's shown. */
export function tillLabel(till: Pick<PartnerPaymentAccountView, 'accountType' | 'shortcode'>): string {
  return `${till.accountType === 'till' ? 'Till' : 'Paybill'} ${till.shortcode}`;
}
