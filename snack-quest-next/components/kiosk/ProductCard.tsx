'use client';

import { MapPin, Plus } from 'lucide-react';
import type { ProductAvailabilityState, SellableCatalogItem } from '@/types';
import { PROMO_LABEL, formatKes } from './format';

export const STATE_LABEL: Record<ProductAvailabilityState, string> = {
  available: '',
  sold_out: 'Sold out',
  unavailable: 'Unavailable',
  coming_soon: 'Coming soon',
  hidden: '',
};

/**
 * A product photo on its own soft ground. `object-contain` rather than
 * `cover`: packshots are photographed edge to edge, and cropping the
 * top of a bag cuts off the brand name the customer is looking for.
 */
export function ProductImage({ item, className = '' }: { item: SellableCatalogItem; className?: string }) {
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a machine-specific catalog image from storage, not a Next-optimizable static asset.
    return <img src={item.imageUrl} alt={item.name} className={`size-full object-contain ${className}`} />;
  }
  return (
    <div className={`flex size-full items-center justify-center ${className}`} aria-hidden="true">
      <span className="font-display text-section-title text-secondary/30">{item.name.trim().charAt(0).toUpperCase()}</span>
    </div>
  );
}

function PromoBadge({ state }: { state: SellableCatalogItem['promotionalState'] }) {
  const label = PROMO_LABEL[state];
  if (!label) return null;
  const tone = state === 'new' ? 'bg-kiosk-highlight text-kiosk-highlight-foreground' : state === 'featured' ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground';
  return <span className={`rounded-full px-3 py-1 text-caption font-semibold ${tone}`}>{label}</span>;
}

/**
 * One menu tile: tap the photo or name to read about it, tap + to add
 * it straight to the order. A tile that cannot be bought says why and
 * offers no + at all, so nothing on it looks tappable that isn't.
 */
export function ProductCard({
  item,
  quantityInCart,
  onOpen,
  onQuickAdd,
}: {
  item: SellableCatalogItem;
  quantityInCart: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const purchasable = item.availabilityState === 'available';
  return (
    <article className="relative flex flex-col rounded-lg bg-surface p-3 shadow-sm lg:p-4">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className={`relative aspect-square w-full overflow-hidden rounded-md bg-background p-4 ${purchasable ? '' : 'grayscale'}`}>
          <ProductImage item={item} className={purchasable ? '' : 'opacity-50'} />
          {!purchasable ? (
            <span className="absolute inset-x-3 bottom-3 rounded-full bg-foreground/85 py-1.5 text-center text-small font-semibold text-background">{STATE_LABEL[item.availabilityState]}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 px-1">
          <h3 className="line-clamp-2 text-body font-semibold text-foreground lg:text-subtitle">{item.name}</h3>
          {item.origin ? (
            <p className="flex items-center gap-1 text-small text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {item.origin}
            </p>
          ) : null}
        </div>
      </button>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <span className="text-subtitle font-bold tabular-nums text-foreground lg:text-card-title">{formatKes(item.priceKes)}</span>
        {purchasable ? (
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label={`Add ${item.name} to cart`}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform duration-150 ease-out outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 motion-reduce:transition-none lg:size-14"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="pointer-events-none absolute left-5 top-5 flex gap-2 lg:left-6 lg:top-6">
        {item.promotionalState !== 'none' ? <PromoBadge state={item.promotionalState} /> : null}
      </div>
      {quantityInCart > 0 ? (
        <span className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full bg-foreground text-small font-bold text-background shadow-sm lg:right-6 lg:top-6">
          {quantityInCart}
          <span className="sr-only"> in your order</span>
        </span>
      ) : null}
    </article>
  );
}
