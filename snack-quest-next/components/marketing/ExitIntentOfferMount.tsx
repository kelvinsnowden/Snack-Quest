import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { productService } from '@/services/productService';
import { hoursUntilOfferExpiry } from '@/lib/packages/offerExpiry';
import { ExitIntentOffer } from './ExitIntentOffer';

const URGENCY_WINDOW_HOURS = 24;

/**
 * The exit-intent rescue offer's mount point (§ exit-intent rescue
 * offer) — a Server Component so "is there a real, active, non-expired
 * rescue offer right now" is decided once, server-side, off real data.
 * Renders nothing at all when there isn't one; the client component
 * never has to guess or fall back to a hardcoded product.
 *
 * The urgency label is computed here, not in the client, specifically
 * so "AVAILABLE TODAY" is never shown unless the real `offerExpiresAt`
 * is actually within a day — no fake countdown, no copy that outlives
 * the data behind it.
 */
export async function ExitIntentOfferMount() {
  const businessId = getCurrentBusinessId();
  const rescueOffer = await productService.getRescueOffer(businessId);
  if (!rescueOffer) {
    return null;
  }

  const { id, data } = rescueOffer;
  const hoursUntilExpiry = hoursUntilOfferExpiry(data.offerExpiresAt);

  const urgencyLabel =
    hoursUntilExpiry === null
      ? 'One-time offer'
      : hoursUntilExpiry <= URGENCY_WINDOW_HOURS
        ? 'One-time offer · Available today'
        : 'One-time offer · Limited time';

  return (
    <ExitIntentOffer
      packageId={id}
      name={data.name}
      priceKes={data.priceKes}
      snackCountLabel={data.snackCountLabel ?? null}
      imageUrl={data.imageUrl}
      urgencyLabel={urgencyLabel}
    />
  );
}
