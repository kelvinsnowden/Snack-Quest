/**
 * Parser for TextSMS's delivery-report (DLR) callback.
 *
 * Written defensively on purpose. TextSMS's Postman collection
 * documents only the *pull* API (`getdlr/`) — it contains no example of
 * the payload they POST to the callback URL configured in their
 * dashboard, so the field names and status tokens below are informed
 * guesses over the usual SMPP/aggregator conventions rather than a
 * contract anyone has seen.
 *
 * Two properties keep that honest:
 *
 * 1. Keys are matched case-insensitively against a list of aliases, so
 *    `messageID`, `messageid` and `message_id` all resolve.
 * 2. Anything not confidently recognised resolves to `'pending'`, which
 *    the caller treats as "record the event, change nothing". An
 *    unrecognised status can therefore never mark a delivered message
 *    as bounced, or vice versa — the worst case is that a real DLR is
 *    logged and ignored until the mapping is tightened.
 *
 * The raw payload is stored on the `webhookEvents` ledger by the route,
 * so the first real callbacks are the evidence needed to replace these
 * guesses with the actual tokens.
 *
 * Deliberately pure and free of `server-only`: it does no I/O, and its
 * whole job is to be exhaustively unit-testable.
 */

export type SmsDeliveryOutcome = 'delivered' | 'failed' | 'pending';

export interface TextSmsDeliveryReport {
  /** Matches `OutboundMessage.providerMessageId`, which `TextSmsGateway` stores as a string. */
  providerMessageId: string;
  outcome: SmsDeliveryOutcome;
  /** The provider's own status token, verbatim and un-normalised — this is what makes a wrong guess above diagnosable from the logs. */
  rawStatus: string | null;
  description: string | null;
  mobile: string | null;
}

const MESSAGE_ID_KEYS = ['messageid', 'message_id', 'msgid', 'clientsmsid', 'id'];
const STATUS_KEYS = ['dlrstatus', 'dlr_status', 'deliverystatus', 'delivery_status', 'status', 'stat', 'state'];
const DESCRIPTION_KEYS = ['description', 'response-description', 'reason', 'errordescription', 'error'];
const MOBILE_KEYS = ['mobile', 'msisdn', 'phone', 'to', 'destination'];

/**
 * `DELIVRD` and friends are the SMPP `stat` tokens nearly every
 * aggregator forwards verbatim; `1` is the dominant numeric convention
 * for the same thing among Kenyan providers. Both are guesses until a
 * real callback confirms them — see this module's header.
 */
const DELIVERED_TOKENS = new Set(['delivrd', 'delivered', 'success', 'successful', 'ok', '1']);

/**
 * `unknown` is deliberately absent: SMPP's `UNKNOWN` means the network
 * could not say, which is not the same as a failure and must not mark a
 * message bounced.
 */
const FAILED_TOKENS = new Set([
  'undeliv',
  'undelivered',
  'undeliverable',
  'rejectd',
  'rejected',
  'expired',
  'failed',
  'failure',
  'deleted',
  '4',
  '5',
]);

/** Lower-cases every key once so callers need only list one spelling per field. Later duplicates lose to earlier ones, which is arbitrary but deterministic. */
function lowerCaseKeys(input: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(input)) {
    const normalized = key.toLowerCase().trim();
    if (!map.has(normalized)) {
      map.set(normalized, value);
    }
  }
  return map;
}

function firstString(source: Map<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source.get(key);
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    // Numbers matter here: `messageid` arrives as a JSON number on the
    // send response, so it is reasonable to expect the same on a DLR.
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

export function classifyDeliveryStatus(rawStatus: string | null): SmsDeliveryOutcome {
  if (rawStatus === null) {
    return 'pending';
  }
  const token = rawStatus.toLowerCase().trim();
  if (DELIVERED_TOKENS.has(token)) {
    return 'delivered';
  }
  if (FAILED_TOKENS.has(token)) {
    return 'failed';
  }
  return 'pending';
}

/**
 * Returns `null` when the payload carries no usable message id — there
 * is nothing to correlate against `outboundMessages`, so the caller
 * logs it and stops rather than guessing at which message it concerns.
 */
export function parseTextSmsDlr(input: Record<string, unknown>): TextSmsDeliveryReport | null {
  const source = lowerCaseKeys(input);

  const providerMessageId = firstString(source, MESSAGE_ID_KEYS);
  if (!providerMessageId) {
    return null;
  }

  const rawStatus = firstString(source, STATUS_KEYS);

  return {
    providerMessageId,
    outcome: classifyDeliveryStatus(rawStatus),
    rawStatus,
    description: firstString(source, DESCRIPTION_KEYS),
    mobile: firstString(source, MOBILE_KEYS),
  };
}
