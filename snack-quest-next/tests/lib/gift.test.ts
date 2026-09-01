import { describe, expect, it } from 'vitest';
import { courierContactFor, GiftValidationError, parseGiftDetails } from '@/lib/checkout/gift';
import { maskPhone } from '@/lib/checkout/phone';
import { GIFT_MESSAGE_MAX_LENGTH } from '@/types/gift';

/**
 * Buying a box for somebody else (§ send a box as a gift).
 *
 * Two properties carry this feature, and both are here: a gift is
 * either complete or refused, never silently dropped; and the person
 * the courier is told about is the person at the address.
 */

describe('parseGiftDetails', () => {
  it('normalizes a complete gift, whatever form the number was typed in', () => {
    expect(
      parseGiftDetails({
        recipientName: '  Amina Wanjiru ',
        recipientPhone: '0790 999 780',
        message: '  Happy birthday!  ',
      }),
    ).toEqual({
      recipientName: 'Amina Wanjiru',
      recipientPhone: '254790999780',
      message: 'Happy birthday!',
    });
  });

  it('treats an absent or empty block as an ordinary order', () => {
    expect(parseGiftDetails(null)).toBeNull();
    expect(parseGiftDetails(undefined)).toBeNull();
    // The checkout posts the block whenever the toggle has been
    // touched, so a buyer who turned it on and off again arrives here
    // with empty strings. That is not a broken gift.
    expect(parseGiftDetails({ recipientName: '', recipientPhone: '', message: '' })).toBeNull();
    expect(parseGiftDetails({ recipientName: '   ', recipientPhone: '  ' })).toBeNull();
  });

  /*
   * The property the whole module exists for. Someone who typed a
   * recipient's name and left the number blank has said plainly that
   * this box is for someone else. Dropping the block and shipping to
   * the buyer would be the cheap read of that, and it delivers a
   * surprise to the wrong house.
   */
  it('refuses a half-filled gift rather than shipping it to the buyer', () => {
    expect(() => parseGiftDetails({ recipientName: 'Amina' })).toThrow(GiftValidationError);
    expect(() => parseGiftDetails({ recipientPhone: '0790999780' })).toThrow(GiftValidationError);
    // A note on its own is still someone saying "this is a gift".
    expect(() => parseGiftDetails({ message: 'Happy birthday!' })).toThrow(GiftValidationError);
  });

  it('refuses a recipient number that could not be called', () => {
    expect(() => parseGiftDetails({ recipientName: 'Amina', recipientPhone: '12345' })).toThrow(
      /Kenyan number/i,
    );
  });

  it('refuses a note longer than the card it gets written on', () => {
    expect(() =>
      parseGiftDetails({
        recipientName: 'Amina',
        recipientPhone: '0790999780',
        message: 'x'.repeat(GIFT_MESSAGE_MAX_LENGTH + 1),
      }),
    ).toThrow(new RegExp(String(GIFT_MESSAGE_MAX_LENGTH)));
  });

  it('accepts a note exactly at the limit', () => {
    const message = 'x'.repeat(GIFT_MESSAGE_MAX_LENGTH);
    expect(parseGiftDetails({ recipientName: 'A', recipientPhone: '0790999780', message })?.message).toBe(
      message,
    );
  });

  /** Null, not '': "no note" is a real state, and an empty string would print a blank card. */
  it('records a missing note as null', () => {
    expect(parseGiftDetails({ recipientName: 'Amina', recipientPhone: '0790999780' })?.message).toBeNull();
  });

  /** A gift note is hand-copied onto a card, so the lines the buyer typed are the lines it has. */
  it('keeps line breaks inside a note', () => {
    const message = 'Happy birthday!\nFrom all of us.';
    expect(
      parseGiftDetails({ recipientName: 'A', recipientPhone: '0790999780', message })?.message,
    ).toBe(message);
  });
});

describe('courierContactFor', () => {
  const buyer = { buyerName: 'Fredrick Nyanjwa', buyerPhone: '254711111111' };

  /*
   * The reason gifting touches the courier at all. A rider handed the
   * buyer's number phones someone who is not at the address, and on a
   * failed delivery phones them again to say the surprise did not
   * arrive.
   */
  it('gives the courier the recipient on a gift, not the buyer', () => {
    expect(
      courierContactFor({
        ...buyer,
        gift: { recipientName: 'Amina Wanjiru', recipientPhone: '254790999780', message: null },
      }),
    ).toEqual({ name: 'Amina Wanjiru', phone: '254790999780' });
  });

  it('gives the courier the buyer on an ordinary order', () => {
    expect(courierContactFor(buyer)).toEqual({
      name: 'Fredrick Nyanjwa',
      phone: '254711111111',
    });
  });

  /*
   * `contactPhone` has been collected and stored on the delivery for a
   * while and never read — the courier always got the paying number.
   * Invisible while both were the same person; not invisible once a
   * box can be going somewhere else.
   */
  it('honours an alternate contact number, which used to be ignored', () => {
    expect(courierContactFor({ ...buyer, contactPhone: '254722222222' })).toEqual({
      name: 'Fredrick Nyanjwa',
      phone: '254722222222',
    });
  });

  it('falls back to the buyer when the alternate number is blank', () => {
    expect(courierContactFor({ ...buyer, contactPhone: '   ' }).phone).toBe('254711111111');
  });

  /** A gift recipient is the person the box is *for*, so they outrank a "call this instead" number. */
  it('prefers the gift recipient over an alternate contact number', () => {
    expect(
      courierContactFor({
        ...buyer,
        contactPhone: '254722222222',
        gift: { recipientName: 'Amina', recipientPhone: '254790999780', message: null },
      }).phone,
    ).toBe('254790999780');
  });
});

describe('maskPhone', () => {
  /*
   * Shown on the payment screen so a customer waiting on a prompt can
   * check it went to the right phone. Masked because that URL is
   * shareable, and recognising your own number needs far less than all
   * of it.
   */
  it('keeps enough to recognise and hides the rest', () => {
    expect(maskPhone('254712345678')).toBe('2547•••••678');
  });

  it('returns nothing rather than a misleading fragment for an unusable value', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone('12345')).toBe('');
  });
});
