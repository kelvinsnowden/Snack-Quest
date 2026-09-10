import { describe, expect, it } from 'vitest';
import { orderAlertRecipientsFor } from '@/lib/notifications/orderAlertRecipients';
import type { Business } from '@/types/business';

/**
 * Who gets texted when an order comes in
 * (§ order alert recipients).
 *
 * Two fields can answer this and exactly one function reads them, so
 * these are the rules the whole feature rests on: the list wins, the
 * legacy single number is a fallback and not a merge, and a number an
 * admin removed must actually stop being texted.
 */
type AlertFields = Pick<Business, 'orderAlertRecipients' | 'adminOrderSmsPhone'>;

const business = (fields: Partial<AlertFields>): AlertFields => ({
  orderAlertRecipients: undefined,
  adminOrderSmsPhone: null,
  ...fields,
});

describe('orderAlertRecipientsFor', () => {
  it('returns the configured list', () => {
    const recipients = orderAlertRecipientsFor(
      business({
        orderAlertRecipients: [
          { phone: '254712345678', label: 'Kelvin' },
          { phone: '254798765432', label: 'Packing station' },
        ],
      }),
    );

    expect(recipients.map((r) => r.phone)).toEqual(['254712345678', '254798765432']);
  });

  /* A business configured before the list existed keeps working. */
  it('falls back to the legacy single number when the list is empty', () => {
    const recipients = orderAlertRecipientsFor(
      business({ orderAlertRecipients: [], adminOrderSmsPhone: '254759209705' }),
    );

    expect(recipients).toEqual([{ phone: '254759209705', label: 'Admin' }]);
  });

  it('falls back when the list is absent entirely', () => {
    const recipients = orderAlertRecipientsFor(
      business({ orderAlertRecipients: undefined, adminOrderSmsPhone: '254759209705' }),
    );

    expect(recipients).toHaveLength(1);
  });

  /*
   * The rule that makes the list a control rather than a suggestion:
   * a merge would keep texting somebody who was just removed.
   */
  it('ignores the legacy number once the list has anyone in it', () => {
    const recipients = orderAlertRecipientsFor(
      business({
        orderAlertRecipients: [{ phone: '254712345678', label: 'Kelvin' }],
        adminOrderSmsPhone: '254759209705',
      }),
    );

    expect(recipients).toEqual([{ phone: '254712345678', label: 'Kelvin' }]);
    expect(recipients.some((r) => r.phone === '254759209705')).toBe(false);
  });

  it('texts a repeated number once', () => {
    const recipients = orderAlertRecipientsFor(
      business({
        orderAlertRecipients: [
          { phone: '254712345678', label: 'Kelvin' },
          { phone: '254712345678', label: 'Kelvin again' },
        ],
      }),
    );

    expect(recipients).toHaveLength(1);
  });

  it('is empty when nothing is configured', () => {
    expect(orderAlertRecipientsFor(business({}))).toEqual([]);
    expect(orderAlertRecipientsFor(null)).toEqual([]);
    expect(orderAlertRecipientsFor(undefined)).toEqual([]);
  });

  it('skips a blank number rather than texting nowhere', () => {
    const recipients = orderAlertRecipientsFor(
      business({
        orderAlertRecipients: [
          { phone: '   ', label: 'Typo' },
          { phone: '254712345678', label: 'Kelvin' },
        ],
      }),
    );

    expect(recipients).toEqual([{ phone: '254712345678', label: 'Kelvin' }]);
  });
});
