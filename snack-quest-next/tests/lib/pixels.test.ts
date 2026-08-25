// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackPixelInitiateCheckout } from '@/lib/analytics/pixels';

/**
 * Reporting purchase intent to Meta and TikTok (§ report chat orders
 * as InitiateCheckout).
 *
 * The cases that matter are the ones where the pixel is not there.
 * Most of this site's traffic arrives inside TikTok's in-app browser,
 * and the pixel scripts load `afterInteractive` — so "absent" and
 * "still loading" are ordinary states, not edge cases, and neither may
 * ever throw into the click handler of a button somebody is trying to
 * buy through.
 */

afterEach(() => {
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { ttq?: unknown }).ttq;
});

describe('trackPixelInitiateCheckout', () => {
  it('reports the box and its value to both platforms', () => {
    const fbq = vi.fn();
    const track = vi.fn();
    window.fbq = fbq;
    window.ttq = { track };

    trackPixelInitiateCheckout({ packageId: 'pkg-1', valueKes: 2500, quantity: 2 });

    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', {
      value: 2500,
      currency: 'KES',
      content_ids: ['pkg-1'],
      content_type: 'product',
      num_items: 2,
    });
    expect(track).toHaveBeenCalledWith('InitiateCheckout', {
      value: 2500,
      currency: 'KES',
      contents: [{ content_id: 'pkg-1', content_type: 'product', quantity: 2, price: 2500 }],
    });
  });

  /** 0 is a claim about price, and a wrong one. Absent is the honest report. */
  it('omits value entirely rather than sending zero when the price is unknown', () => {
    const fbq = vi.fn();
    window.fbq = fbq;

    trackPixelInitiateCheckout({ packageId: 'pkg-1' });

    const params = fbq.mock.calls[0][2] as Record<string, unknown>;
    expect('value' in params).toBe(false);
    expect('currency' in params).toBe(false);
    expect(params.content_ids).toEqual(['pkg-1']);
  });

  it('sends no product fields when no single box is selected', () => {
    const fbq = vi.fn();
    const track = vi.fn();
    window.fbq = fbq;
    window.ttq = { track };

    trackPixelInitiateCheckout();

    expect(fbq.mock.calls[0][2]).toEqual({ num_items: 1 });
    expect(track.mock.calls[0][1]).toEqual({});
  });

  it('does nothing when neither pixel has loaded', () => {
    expect(() => trackPixelInitiateCheckout({ packageId: 'pkg-1', valueKes: 2500 })).not.toThrow();
  });

  /** One blocked extension must not cost the other platform its event. */
  it('still reports to TikTok when Meta is present but throwing', () => {
    const track = vi.fn();
    window.fbq = () => {
      throw new Error('blocked by extension');
    };
    window.ttq = { track };

    expect(() => trackPixelInitiateCheckout({ packageId: 'pkg-1', valueKes: 2500 })).not.toThrow();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('survives TikTok throwing too', () => {
    const fbq = vi.fn();
    window.fbq = fbq;
    window.ttq = {
      track: () => {
        throw new Error('blocked');
      },
    };

    expect(() => trackPixelInitiateCheckout({ valueKes: 100 })).not.toThrow();
    expect(fbq).toHaveBeenCalledTimes(1);
  });
});
