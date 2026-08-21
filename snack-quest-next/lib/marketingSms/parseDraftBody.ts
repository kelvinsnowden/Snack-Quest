import type { MarketingSmsSegment } from '@/types';

/**
 * Request-body validation for the Marketing SMS draft routes, in `lib`
 * rather than beside the route because a `route.ts` may only export
 * HTTP handlers — the same reason `lib/marketingEmails/parseDraftBody.ts`
 * exists.
 *
 * Shape only. Whether the message is too long, or a custom list
 * contains a usable number, is `MarketingSmsService.validateDraft`'s
 * call — one place, so the API and any future caller cannot disagree
 * about what a valid campaign is.
 */

const SEGMENTS: MarketingSmsSegment[] = [
  'all_customers',
  'recent_customers',
  'lapsed_customers',
  'repeat_customers',
  'one_time_customers',
  'high_value_customers',
  'custom',
];

export interface SmsDraftBody {
  name?: unknown;
  bodyText?: unknown;
  segment?: unknown;
  customRecipients?: unknown;
}

export interface ParsedSmsDraft {
  name: string;
  bodyText: string;
  segment: MarketingSmsSegment;
  customRecipients: string[] | null;
}

export function parseSmsDraftBody(body: SmsDraftBody): { input: ParsedSmsDraft } | { error: string } {
  const { name, bodyText, segment, customRecipients } = body ?? {};

  if (typeof name !== 'string' || typeof bodyText !== 'string') {
    return { error: 'name and bodyText are required' };
  }
  if (typeof segment !== 'string' || !SEGMENTS.includes(segment as MarketingSmsSegment)) {
    return { error: `segment must be one of: ${SEGMENTS.join(', ')}` };
  }
  if (customRecipients !== undefined && customRecipients !== null && !Array.isArray(customRecipients)) {
    return { error: 'customRecipients must be an array of phone numbers' };
  }

  return {
    input: {
      name,
      bodyText,
      segment: segment as MarketingSmsSegment,
      customRecipients: Array.isArray(customRecipients) ? customRecipients.map(String) : null,
    },
  };
}
