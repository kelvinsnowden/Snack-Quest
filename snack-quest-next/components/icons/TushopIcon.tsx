import Image from 'next/image';

/**
 * Tushop's mark, in the partner marquee (§ Jumia to Fargo migration).
 *
 * A rounded tile for the same reason `FargoIcon` is one: the supplied
 * file is fully opaque, 400x400, with Tushop's orange running to every
 * edge. It is a brand badge, not a transparent logo, so it is shown the
 * way the brand supplies it rather than knocked out onto the page.
 *
 * Its orange sits close to this site's own primary. That is left alone
 * rather than corrected — recolouring somebody's logo to avoid a clash
 * is worse than the clash, and the rounded tile already reads as a
 * separate object rather than as site chrome.
 */
export function TushopIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/tushop.png"
      alt="Tushop"
      width={400}
      height={400}
      // Fixed brand asset; the optimizer gains nothing on it and
      // re-encoding a logo only softens it.
      unoptimized
      className={`aspect-square w-auto rounded-lg object-contain ${className ?? ''}`}
    />
  );
}
