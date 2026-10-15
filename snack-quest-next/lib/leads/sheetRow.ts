import { createHash } from 'node:crypto';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import type { VendingLeadSegment, VendingLeadSourceFields } from '@/types/vendingLead';

/**
 * Turns one row of the Meta lead-form Google Sheet into a lead
 * (§ vending leads CRM).
 *
 * The sheet's columns are whatever Meta's sheet integration (or
 * Zapier, or a person) decided to write, and they change whenever the
 * form's questions do, so nothing here depends on column order or an
 * exact header list. Known Meta columns are picked out by name; every
 * other non-empty column becomes a question/answer pair, so a question
 * added to the form next month shows up in the admin without a deploy.
 */

export type SheetRow = Record<string, unknown>;

/** Meta bookkeeping columns: useful to Meta, noise on a lead card. */
const IGNORED = new Set([
  'ad_id',
  'adset_id',
  'adset_name',
  'campaign_id',
  'form_id',
  'is_organic',
  'lead_status',
  'inbox_url',
  'synced',
  'row',
]);

const ID_KEYS = ['id', 'lead_id', 'leadgen_id'];
const CREATED_KEYS = ['created_time', 'created_at', 'timestamp', 'date'];
const NAME_KEYS = ['full_name', 'name', 'your_name'];
const PHONE_KEYS = ['phone_number', 'phone', 'whatsapp_number', 'whatsapp', 'mobile', 'mobile_number'];
const EMAIL_KEYS = ['email', 'email_address'];

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Meta prefixes some values with a type tag (`p:+2547…` for phone numbers). */
function stripMetaPrefix(value: string): string {
  return value.replace(/^[a-z]:/i, '').trim();
}

function prettyLabel(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function normalizeLeadPhone(raw: string): string {
  const value = stripMetaPrefix(raw);
  if (!value) return '';
  try {
    return normalizeKenyanPhone(value);
  } catch {
    // Not a Kenyan mobile — keep the digits so staff can still dial it.
    return value.replace(/[^\d+]/g, '');
  }
}

/** A first guess from the campaign, ad and form names — staff can change it on the lead. */
export function guessSegment(...names: (string | null)[]): VendingLeadSegment {
  const text = names.filter(Boolean).join(' ').toLowerCase();
  if (/host|landlord|brand|location|bank|industr|property|mall|estate/.test(text)) return 'host';
  if (/invest|owner|partner|founding|business|machine/.test(text)) return 'investor';
  return 'unknown';
}

function parseSubmittedAt(value: string, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

export interface ParsedSheetRow {
  fields: VendingLeadSourceFields;
  segment: VendingLeadSegment;
}

/**
 * Null for a row with nothing to contact — no name, phone or email —
 * which is what a blank or half-deleted sheet row looks like.
 */
export function parseSheetRow(row: SheetRow, nowMs: number = Date.now()): ParsedSheetRow | null {
  const values = new Map<string, string>();
  const order: string[] = [];
  for (const [header, raw] of Object.entries(row)) {
    const key = normalizeHeader(header);
    if (!key || values.has(key)) continue;
    values.set(key, cell(raw));
    order.push(key);
  }

  const first = (keys: string[]): string => {
    for (const key of keys) {
      const value = values.get(key);
      if (value) return value;
    }
    return '';
  };

  const firstName = values.get('first_name') ?? '';
  const lastName = values.get('last_name') ?? '';
  const fullName = stripMetaPrefix(first(NAME_KEYS)) || `${firstName} ${lastName}`.trim();
  const phone = normalizeLeadPhone(first(PHONE_KEYS));
  const emailRaw = stripMetaPrefix(first(EMAIL_KEYS)).toLowerCase();
  const email = emailRaw.includes('@') ? emailRaw : null;

  if (!fullName && !phone && !email) {
    return null;
  }

  const createdRaw = first(CREATED_KEYS);
  const submittedAtMs = parseSubmittedAt(createdRaw, nowMs);

  // Meta's lead id when there is one; otherwise a stable fingerprint
  // of who and when, so a hand-typed row re-sent is still one lead.
  const metaId = stripMetaPrefix(first(ID_KEYS));
  const externalId =
    metaId ||
    `row_${createHash('sha256')
      .update(`${phone}|${email ?? ''}|${fullName}|${createdRaw}`)
      .digest('hex')
      .slice(0, 24)}`;

  const campaignName = values.get('campaign_name') || null;
  const adName = values.get('ad_name') || null;
  const formName = values.get('form_name') || null;
  const platform = values.get('platform') || null;

  const consumed = new Set([
    ...ID_KEYS,
    ...CREATED_KEYS,
    ...NAME_KEYS,
    ...PHONE_KEYS,
    ...EMAIL_KEYS,
    'first_name',
    'last_name',
    'campaign_name',
    'ad_name',
    'form_name',
    'platform',
  ]);

  const answers = order
    .filter((key) => !consumed.has(key) && !IGNORED.has(key))
    .map((key) => ({ label: prettyLabel(key), value: stripMetaPrefix(values.get(key) ?? '') }))
    .filter((answer) => answer.value.length > 0)
    .map((answer) => ({ label: answer.label.slice(0, 200), value: answer.value.slice(0, 1000) }))
    .slice(0, 40);

  return {
    fields: {
      source: 'meta_sheet',
      externalId: externalId.slice(0, 120),
      fullName: (fullName || 'Unnamed lead').slice(0, 120),
      phone,
      email,
      campaignName,
      adName,
      formName,
      platform,
      answers,
      submittedAtMs,
    },
    segment: guessSegment(campaignName, adName, formName),
  };
}
