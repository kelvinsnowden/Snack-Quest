'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * The box artwork on the payment screens (§ payment screen rebuild).
 *
 * A client component for one reason: if the asset is missing it
 * removes itself, and the layout closes up around it. Everything on
 * these screens still works without the picture — the badge, the
 * headline, the receipt, the buttons — so a missing file should cost
 * an image, not leave a broken-image icon in the middle of a payment
 * confirmation. That also means the screens can ship before the
 * artwork does.
 *
 * `unoptimized` because this is a single fixed brand asset with a
 * transparent background: the optimizer gains nothing on it and the
 * alpha channel is the whole point. Explicit dimensions rather than
 * `fill` so it reserves its own space and nothing below shifts as it
 * loads.
 */
/**
 * `.webp`, and named accurately on purpose. The file arrived as a WebP
 * with a `.png` extension — browsers mostly sniff past that, but the
 * server would have been advertising `Content-Type: image/png` over a
 * WebP body, which is a mismatch waiting to be believed by something.
 * WebP is also the smaller format, and every browser this storefront
 * targets reads it.
 */
export const BOX_HERO_SRC = '/snack-box-hero.webp';

/** The asset's true intrinsic size, so the reserved space matches the picture and nothing shifts as it loads. */
const INTRINSIC = { width: 1214, height: 1295 };

export function SnackBoxHero({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/3 mx-auto h-40 w-4/5 rounded-full bg-[#7c3aed]/40 blur-3xl"
      />
      <Image
        src={BOX_HERO_SRC}
        alt="A Snack Quest box with Japanese, Korean and Thai snacks bursting out of it"
        width={INTRINSIC.width}
        height={INTRINSIC.height}
        unoptimized
        priority
        onError={() => setFailed(true)}
        className="relative mx-auto h-auto w-full max-w-[340px]"
      />
    </div>
  );
}
