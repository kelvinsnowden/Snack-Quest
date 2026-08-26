import { describe, it, expect } from 'vitest';
import { toSmsSafeText } from '@/lib/sms/gsm7';

/**
 * The point of these is money, not appearance: a single non-GSM-7
 * character takes the whole message from 160-character segments to
 * 70-character ones (§ customer communications move to SMS).
 */
describe('SMS-safe text', () => {
  it('replaces the em dash the conversation copy is full of', () => {
    expect(toSmsSafeText('Total: KES 2800 — enter your PIN')).toBe(
      'Total: KES 2800 - enter your PIN',
    );
  });

  it('replaces curly quotes, ellipses and odd spaces', () => {
    expect(toSmsSafeText('We’ll say “hello”…')).toBe('We\'ll say "hello"...');
    expect(toSmsSafeText('KES 2,800')).toBe('KES 2,800');
  });

  /*
   * The whole reason this exists. A message is GSM-7 or it is not —
   * there is no partial credit — so the test is that nothing outside
   * the alphabet survives.
   */
  it('leaves a real message entirely within GSM-7', () => {
    const message =
      'Hi Wanjiru, Achieng from Snack Quest has set up your order:\n\n' +
      '1 x Premium Box\nKasarani Pickup Station, Nairobi (Fargo Courier pickup)\n' +
      'Total: KES 2800\nPlus KES 300 to the courier on delivery\n\n' +
      'An M-Pesa prompt is on its way — enter your PIN to confirm. If you were not expecting this, ignore it and nothing will be charged.';

    const safe = toSmsSafeText(message);
    const gsm7 =
      '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r' +
      '^{}\\[~]|€';
    const outside = [...safe].filter((ch) => !gsm7.includes(ch));
    expect(outside).toEqual([]);
  });

  /*
   * A snack name that genuinely needs the wider encoding is left
   * alone. Saving a shilling is not worth mangling a product name.
   */
  it('leaves characters with no ASCII equivalent alone', () => {
    expect(toSmsSafeText('Tokyo Banana とうきょう')).toBe('Tokyo Banana とうきょう');
  });
});
