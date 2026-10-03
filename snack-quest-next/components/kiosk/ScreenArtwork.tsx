'use client';

import { useEffect, useState } from 'react';
import type { KioskScreenContentImage, SellableCatalogItem } from '@/types';
import { ProductImage } from './ProductCard';

const BANNER_ROTATE_MS = 6_000;
const ATTRACT_ROTATE_MS = 8_000;

/** Index that advances every `intervalMs` while there is more than one thing to show. */
function useRotation(count: number, intervalMs: number): [number, (index: number) => void] {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, intervalMs]);
  return [count === 0 ? 0 : index % count, setIndex];
}

/** Stacked images, one visible at a time, cross-fading. Only the visible one is exposed to assistive tech. */
function Slides({ images, index }: { images: KioskScreenContentImage[]; index: number }) {
  return (
    <>
      {images.map((image, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded artwork from storage, not a Next-optimizable static asset.
        <img
          key={image.imageUrl + i}
          src={image.imageUrl}
          alt={i === index ? image.altText : ''}
          aria-hidden={i === index ? undefined : true}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ease-out motion-reduce:transition-none ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </>
  );
}

/**
 * The banner across the top of the menu. Staff choose its images (Admin
 * → Vending → Machine Screen, placement "Menu banner"); with none
 * chosen it draws the built-in Snack Quest banner, naming the countries
 * the snacks on this machine come from.
 */
export function MenuBanner({ images, origins, eyebrow = 'Explore. Taste. Enjoy.', headline = 'Taste the world' }: { images: KioskScreenContentImage[]; origins: string[]; eyebrow?: string; headline?: string }) {
  const [index, setIndex] = useRotation(images.length, BANNER_ROTATE_MS);

  if (images.length > 0) {
    return (
      <section aria-label="Promotions" className="relative">
        <div className="relative aspect-[27/10] w-full overflow-hidden rounded-xl bg-kiosk-stage">
          <Slides images={images} index={index} />
        </div>
        {images.length > 1 ? (
          <div className="mt-3 flex justify-center gap-2">
            {images.map((image, i) => (
              <button
                key={image.imageUrl + i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show promotion ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className="flex h-6 items-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className={`block h-2 rounded-full transition-all duration-200 ease-out motion-reduce:transition-none ${i === index ? 'w-8 bg-foreground' : 'w-2 bg-foreground/25'}`} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const places = origins.slice(0, 4);
  return (
    <section aria-label="Welcome" className="relative flex aspect-[27/10] w-full items-center overflow-hidden rounded-xl bg-kiosk-stage px-6 sm:px-10">
      <div className="relative z-10 flex max-w-[62%] flex-col gap-2 sm:gap-3">
        <p className="text-caption font-semibold uppercase tracking-wider text-kiosk-highlight sm:text-small">{eyebrow}</p>
        <h2 className="font-display text-card-title leading-none text-kiosk-stage-foreground text-balance sm:text-section-title lg:text-page-title">{headline}</h2>
        <p className="text-small text-kiosk-stage-foreground/80 sm:text-body">
          {places.length > 0 ? `Snacks from ${places.join(', ')}${origins.length > places.length ? ' and more' : ''}.` : 'Snacks from around the world.'} Pay with M-Pesa.
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed public asset. */}
      <img src="/logo.png" alt="" className="absolute right-0 top-1/2 h-[95%] -translate-y-1/2 sm:right-4" />
    </section>
  );
}

/**
 * What the screen shows while nobody is using it. Staff-chosen
 * full-screen images when there are any (placement "Idle screen"),
 * otherwise the brand mark over a slow parade of what this machine
 * sells. A tap anywhere opens the menu.
 */
export function AttractScreen({
  images,
  items,
  onStart,
  headline = 'Snacks from around the world, right here.',
  callToAction = 'Tap to start',
}: {
  images: KioskScreenContentImage[];
  items: SellableCatalogItem[];
  onStart: () => void;
  headline?: string;
  callToAction?: string;
}) {
  const [index] = useRotation(images.length, ATTRACT_ROTATE_MS);
  const showcase = items.filter((item) => item.imageUrl && item.availabilityState === 'available').slice(0, 6);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-kiosk-stage text-kiosk-stage-foreground">
      <button type="button" onClick={onStart} className="absolute inset-0 z-20 outline-none" aria-label={callToAction === 'Tap to start' ? 'Tap to start your order' : `${callToAction} — tap to start your order`} />
      {images.length > 0 ? (
        <Slides images={images} index={index} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed public asset. */}
          <img src="/logo.png" alt="Snack Quest" className="w-2/3 max-w-md" />
          <p className="font-display text-section-title leading-tight text-balance lg:text-page-title">{headline}</p>
          {showcase.length > 0 ? (
            <ul aria-hidden="true" className="grid w-full max-w-2xl grid-cols-3 gap-4">
              {showcase.map((item) => (
                <li key={`${item.productCatalogue}:${item.productId}`} className="aspect-square rounded-lg bg-kiosk-stage-foreground/10 p-4">
                  <ProductImage item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <div className="pointer-events-none relative z-10 mt-auto flex justify-center pb-16">
        <span className="animate-pulse rounded-full bg-kiosk-highlight px-10 py-5 text-subtitle font-bold text-kiosk-highlight-foreground shadow-lg motion-reduce:animate-none">
          {callToAction}
        </span>
      </div>
    </main>
  );
}
