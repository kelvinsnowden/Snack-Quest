/**
 * The full M-Pesa lockup (wordmark + the phone/flag mark between "M"
 * and "PESA") for the partner marquee — a fuller reproduction than
 * `MpesaBadge.tsx`'s small text-only pill, built the same way as
 * `BoltIcon`: real brand green, `textLength`-pinned text
 * so it can't drift against its neighbours, and a simplified vector
 * approximation of the phone-and-flag mark rather than a traced copy.
 */
export function MpesaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 50" className={className} role="img" aria-label="M-Pesa">
      <text
        x="0"
        y="36"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize={34}
        textLength={30}
        lengthAdjust="spacingAndGlyphs"
        fill="#3AA635"
      >
        M
      </text>
      <g transform="translate(36, 5)">
        <rect x="0" y="0" width="15" height="32" rx="4" fill="#D9E8D3" />
        <rect x="3" y="5" width="9" height="19" rx="1.5" fill="#fff" />
        <path d="M-1 15c4 5 9 6 15 3l1 3c-7 4-13 2-17-3l1-3Z" fill="#7A4A2E" />
        <path d="M-2 12c5 6 11 7 18 3l1 3c-8 5-15 3-20-3l1-3Z" fill="#E2231A" />
      </g>
      <text
        x="60"
        y="36"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize={34}
        textLength={98}
        lengthAdjust="spacingAndGlyphs"
        fill="#3AA635"
      >
        PESA
      </text>
    </svg>
  );
}
