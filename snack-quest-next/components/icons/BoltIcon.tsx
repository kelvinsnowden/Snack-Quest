/**
 * Bolt's wordmark, reproduced as scalable text rather than a traced
 * raster copy (§ Creator Program partner marquee) — `textLength` pins
 * the rendered width regardless of which font a browser substitutes,
 * so it never drifts against the neighbouring logos in the marquee.
 * Real Bolt green (`#34D186`), never recoloured to match this site's
 * own palette — the whole point of a partner marquee is that these are
 * recognisably *not* Snack Quest's colours.
 */
export function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 108 40" className={className} role="img" aria-label="Bolt">
      <text
        x="0"
        y="31"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize={34}
        textLength={78}
        lengthAdjust="spacingAndGlyphs"
        fill="#34D186"
      >
        Bolt
      </text>
      <circle cx="49" cy="36" r="3.4" fill="#34D186" />
    </svg>
  );
}
