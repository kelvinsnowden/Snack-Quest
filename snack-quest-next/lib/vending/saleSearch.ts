import type { SaleTraceQuery } from '@/services/saleTraceService';

/**
 * What someone typed into a sale search box, as a trace query. Receipts,
 * sale references, dispense references and M-Pesa checkout ids look
 * different enough that support never has to say which one they have.
 */
export function saleQueryFromReference(raw: string): SaleTraceQuery | null {
  const reference = raw.trim();
  if (!reference) return null;
  if (/^TXN-/i.test(reference)) return { transactionRef: reference.toUpperCase() };
  if (/^DSP-/i.test(reference)) return { commandRef: reference.toUpperCase() };
  if (reference.startsWith('ws_CO_')) return { checkoutRequestId: reference };
  if (/^[A-Za-z0-9]{8,12}$/.test(reference) && /\d/.test(reference) && /[A-Za-z]/.test(reference)) return { paymentRef: reference.toUpperCase() };
  return { transactionId: reference };
}
