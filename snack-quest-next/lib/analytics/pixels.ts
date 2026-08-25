/**
 * Browser-side ad-pixel events (§ report chat orders as InitiateCheckout).
 *
 * The pixels were loaded in `app/(marketing)/layout.tsx` and only ever
 * fired `PageView`; the server-side Conversions API only ever fires
 * `Purchase`. Between "someone looked at the site" and "someone paid"
 * the ad platforms were told nothing at all — and with no completed
 * purchases yet, that left both Meta and TikTok optimising on page
 * views, which is to say on the wrong people.
 *
 * `InitiateCheckout` is the standard event name on both platforms, so
 * one call site can serve both.
 *
 * Everything here is best-effort and silent. A pixel is routinely
 * absent — blocked by an extension, still loading (`afterInteractive`),
 * or stripped by an in-app browser, which matters here because most of
 * this site's traffic arrives inside TikTok's. An analytics call must
 * never be able to stop somebody buying, so nothing below can throw
 * into a click handler.
 */

/** What both pixels want to know about the thing being bought. */
export interface PixelCheckoutItem {
  packageId?: string;
  /** Whole KES. Sent as `value` — omitted rather than sent as 0 when unknown, since 0 is a claim about price. */
  valueKes?: number;
  quantity?: number;
}

type FbqFn = (method: string, event: string, params?: Record<string, unknown>) => void;
type TtqObject = { track: (event: string, params?: Record<string, unknown>) => void };

declare global {
  interface Window {
    fbq?: FbqFn;
    ttq?: TtqObject;
  }
}

/**
 * Reports purchase intent to Meta and TikTok.
 *
 * Called wherever a customer commits to buying, whichever way they
 * chose to do it — the web checkout and the WhatsApp hand-off both
 * count, because from the ad platform's side they are the same person
 * taking the same step. Reporting only one of them would teach the
 * platforms that only that kind of customer is worth finding.
 */
export function trackPixelInitiateCheckout(item: PixelCheckoutItem = {}): void {
  const contentIds = item.packageId ? [item.packageId] : [];
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const hasValue = typeof item.valueKes === 'number' && Number.isFinite(item.valueKes);

  try {
    window.fbq?.('track', 'InitiateCheckout', {
      ...(hasValue ? { value: item.valueKes, currency: 'KES' } : {}),
      ...(contentIds.length > 0 ? { content_ids: contentIds, content_type: 'product' } : {}),
      num_items: quantity,
    });
  } catch {
    // See this module's own comment — never surfaced, never rethrown.
  }

  try {
    window.ttq?.track('InitiateCheckout', {
      ...(hasValue ? { value: item.valueKes, currency: 'KES' } : {}),
      ...(item.packageId
        ? {
            contents: [
              {
                content_id: item.packageId,
                content_type: 'product',
                quantity,
                ...(hasValue ? { price: item.valueKes } : {}),
              },
            ],
          }
        : {}),
    });
  } catch {
    // As above.
  }
}
