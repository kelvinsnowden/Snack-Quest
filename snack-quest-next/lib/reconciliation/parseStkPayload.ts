/**
 * Best-effort extraction of the human-relevant fields from a raw,
 * unmatched Daraja STK callback payload (§ Payment reconciliation) —
 * for display only, never re-parsed as a trusted source of truth (that
 * job belongs to `DarajaGateway.verifyCallback`, which this bypasses
 * on purpose: an unmatched payment is one that Service already
 * couldn't act on, this is just showing staff what Safaricom sent).
 */

interface StkCallbackMetadataItem {
  Name?: string;
  Value?: string | number;
}

export interface ParsedStkPayload {
  resultCode: number | null;
  resultDesc: string | null;
  amountKes: number | null;
  mpesaReceiptNumber: string | null;
  phoneNumber: string | null;
  transactionDate: string | null;
}

export function parseStkPayload(payload: Record<string, unknown>): ParsedStkPayload {
  const stkCallback = (payload as { Body?: { stkCallback?: Record<string, unknown> } }).Body?.stkCallback;
  if (!stkCallback) {
    return {
      resultCode: null,
      resultDesc: null,
      amountKes: null,
      mpesaReceiptNumber: null,
      phoneNumber: null,
      transactionDate: null,
    };
  }

  const items = ((stkCallback.CallbackMetadata as { Item?: StkCallbackMetadataItem[] } | undefined)?.Item ??
    []) as StkCallbackMetadataItem[];
  const findItem = (name: string): string | number | undefined => items.find((item) => item.Name === name)?.Value;

  return {
    resultCode: typeof stkCallback.ResultCode === 'number' ? stkCallback.ResultCode : null,
    resultDesc: typeof stkCallback.ResultDesc === 'string' ? stkCallback.ResultDesc : null,
    amountKes: typeof findItem('Amount') === 'number' ? (findItem('Amount') as number) : null,
    mpesaReceiptNumber: findItem('MpesaReceiptNumber') != null ? String(findItem('MpesaReceiptNumber')) : null,
    phoneNumber: findItem('PhoneNumber') != null ? String(findItem('PhoneNumber')) : null,
    transactionDate: findItem('TransactionDate') != null ? String(findItem('TransactionDate')) : null,
  };
}
