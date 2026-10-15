import { describe, expect, it } from 'vitest';
import { guessSegment, normalizeHeader, normalizeLeadPhone, parseSheetRow } from '@/lib/leads/sheetRow';

/**
 * The Meta lead-form Google Sheet → lead mapping (§ vending leads CRM).
 * The row below is the shape Meta's own Sheets integration writes:
 * bookkeeping columns, `p:`-prefixed phone numbers, and one column per
 * form question named after the question.
 */
const META_ROW = {
  id: 'l:1234567890123456',
  created_time: '2026-10-15T09:12:44+03:00',
  ad_id: 'ag:120200000000',
  ad_name: 'Investor text ad',
  adset_id: 'as:1',
  adset_name: 'Nairobi 25-55',
  campaign_id: 'c:1',
  campaign_name: 'Vending founding partners — investors',
  form_id: 'f:1',
  form_name: 'Founding partner application',
  is_organic: 'false',
  platform: 'ig',
  'How much capital can you deploy?': 'KSh 500K – 1M',
  'Do you have a location?': 'Yes',
  full_name: 'Wanjiru Kamau',
  phone_number: 'p:+254712345678',
  email: 'Wanjiru@Example.com',
  lead_status: 'CREATED',
};

describe('parseSheetRow', () => {
  it('maps a Meta row into a lead, keeping questions as answers and dropping bookkeeping', () => {
    const parsed = parseSheetRow(META_ROW)!;
    expect(parsed.fields).toMatchObject({
      source: 'meta_sheet',
      externalId: '1234567890123456',
      fullName: 'Wanjiru Kamau',
      phone: '254712345678',
      email: 'wanjiru@example.com',
      campaignName: 'Vending founding partners — investors',
      adName: 'Investor text ad',
      formName: 'Founding partner application',
      platform: 'ig',
      submittedAtMs: Date.parse('2026-10-15T09:12:44+03:00'),
    });
    expect(parsed.fields.answers).toEqual([
      { label: 'How much capital can you deploy', value: 'KSh 500K – 1M' },
      { label: 'Do you have a location', value: 'Yes' },
    ]);
    expect(parsed.segment).toBe('investor');
  });

  it('is stable for a row with no Meta id, so a resend lands on the same lead', () => {
    const row = { Name: 'Otieno', Phone: '0722 334 455', Timestamp: '2026-10-15T10:00:00Z' };
    const a = parseSheetRow(row)!;
    const b = parseSheetRow({ ...row })!;
    expect(a.fields.externalId).toMatch(/^row_/);
    expect(a.fields.externalId).toBe(b.fields.externalId);
    expect(a.fields.phone).toBe('254722334455');
  });

  it('joins first and last name when there is no full name column', () => {
    expect(parseSheetRow({ first_name: 'Amina', last_name: 'Hassan', phone: '0712345678' })!.fields.fullName).toBe(
      'Amina Hassan',
    );
  });

  it('skips a row with nobody to contact', () => {
    expect(parseSheetRow({ id: '1', campaign_name: 'x', notes: 'y' })).toBeNull();
    expect(parseSheetRow({})).toBeNull();
  });

  it('falls back to now when the submission time does not parse', () => {
    expect(parseSheetRow({ full_name: 'A', created_time: 'yesterday-ish' }, 42)!.fields.submittedAtMs).toBe(42);
  });
});

describe('helpers', () => {
  it('normalizes headers whatever their casing or punctuation', () => {
    expect(normalizeHeader('  Phone Number ')).toBe('phone_number');
    expect(normalizeHeader('What’s your budget?')).toBe('what_s_your_budget');
  });

  it('keeps a non-Kenyan number dialable rather than dropping it', () => {
    expect(normalizeLeadPhone('p:+44 7700 900123')).toBe('+447700900123');
    expect(normalizeLeadPhone('')).toBe('');
  });

  it('guesses host for location-side campaigns and investor for owner-side ones', () => {
    expect(guessSegment('Brands & landlords — hosts', null, null)).toBe('host');
    expect(guessSegment(null, 'Investor text ad', null)).toBe('investor');
    expect(guessSegment(null, null, null)).toBe('unknown');
  });
});
