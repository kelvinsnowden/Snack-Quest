import Image from 'next/image';

/**
 * Fargo Courier's mark (§ Jumia to Fargo migration).
 *
 * Rendered as a rounded tile rather than an inline glyph, because that
 * is what the asset actually is: the supplied file is fully opaque —
 * a white and gold star on Fargo's dark green — not a transparent
 * logo that can sit on any background. Trying to knock the green out
 * would leave a white wordmark that disappears on a light page, so it
 * is presented the way the brand supplies it: as a badge.
 *
 * That also settles the sizing. Its siblings here (`BoltIcon`,
 * `MpesaLogo`) are wide wordmarks that a caller heights with `h-7`;
 * this one is square, so `aspect-square` keeps the height contract
 * those callers already use without stretching a logo that is 307x297.
 *
 * Named `FargoIcon` and typed like the SVG icons it replaced so both
 * call sites — the partner marquee and the route badges — keep passing
 * a bare `className` and nothing else had to change.
 */
export function FargoIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/fargo.png"
      alt="Fargo Courier"
      width={307}
      height={297}
      // A fixed brand asset at its native size; the optimizer has
      // nothing to gain on 38KB and re-encoding a logo only softens it.
      unoptimized
      className={`aspect-square w-auto rounded-lg object-contain ${className ?? ''}`}
    />
  );
}
