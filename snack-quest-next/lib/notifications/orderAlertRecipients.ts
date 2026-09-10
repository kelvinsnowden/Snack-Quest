import type { Business, OrderAlertRecipient } from '@/types/business';

/**
 * Who gets texted when an order comes in (§ order alert recipients).
 *
 * There are two fields on `Business` that can answer this, and exactly
 * one function that reads them, so the send path never has to know
 * which one a given tenant is configured with.
 *
 * The list wins when it has anyone in it; `adminOrderSmsPhone` is the
 * fallback for a business configured before the list existed. It is a
 * fallback rather than a merge on purpose — merging would mean an
 * admin who removes a number from the list still sees it texted,
 * because the old single field quietly kept it. A removed number must
 * stop receiving orders, or the list is not a control at all.
 *
 * Duplicate numbers collapse. The same phone entered twice is one
 * person who would otherwise be texted twice per order, and the
 * dedupe key is per recipient, so nothing further downstream would
 * catch it.
 */
export function orderAlertRecipientsFor(
  business: Pick<Business, 'orderAlertRecipients' | 'adminOrderSmsPhone'> | null | undefined,
): OrderAlertRecipient[] {
  if (!business) {
    return [];
  }

  const configured = business.orderAlertRecipients ?? [];
  const chosen: OrderAlertRecipient[] =
    configured.length > 0
      ? configured
      : business.adminOrderSmsPhone
        ? [{ phone: business.adminOrderSmsPhone, label: 'Admin' }]
        : [];

  const seen = new Set<string>();
  return chosen.filter((recipient) => {
    const phone = recipient.phone?.trim();
    if (!phone || seen.has(phone)) {
      return false;
    }
    seen.add(phone);
    return true;
  });
}
