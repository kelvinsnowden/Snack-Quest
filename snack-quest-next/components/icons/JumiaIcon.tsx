/** See `BoltIcon.tsx` for the `textLength` approach and why these are text, not traced artwork. Real Jumia black/orange, unrecoloured. */
export function JumiaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 178 44" className={className} role="img" aria-label="Jumia">
      <text
        x="0"
        y="33"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize={32}
        textLength={126}
        lengthAdjust="spacingAndGlyphs"
        fill="#1A1A1A"
      >
        JUMIA
      </text>
      <g transform="translate(140, 6)">
        <circle cx="10" cy="10" r="10" fill="#F68B1E" />
        <path
          d="M10 3.6l1.7 4.4 4.7.4-3.6 3.1 1.1 4.6-3.9-2.5-3.9 2.5 1.1-4.6-3.6-3.1 4.7-.4L10 3.6Z"
          fill="#fff"
        />
      </g>
    </svg>
  );
}
