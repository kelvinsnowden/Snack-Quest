/**
 * Fargo Courier, set as a wordmark rather than shipped as their logo
 * file (§ Jumia to Fargo migration).
 *
 * Deliberate: this codebase does not hold a licensed copy of Fargo's
 * mark, and redrawing someone's logo from memory produces something
 * that is recognisably wrong next to the real thing. A wordmark is
 * honest, stays crisp at any density, costs no request, and reads
 * correctly beside the Bolt and M-Pesa marks it sits with.
 *
 * Swap this for the real asset the moment Fargo provides one — the
 * component's shape (an `svg` taking `className`) matches the sibling
 * icons exactly, so nothing else changes.
 */
export function FargoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 170 32"
      role="img"
      aria-label="Fargo Courier"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The star device, reduced to its silhouette — a shape, not a reproduction of their logo. */}
      <path
        d="M16 3.5l3.6 7.9 8.6 1-6.4 5.8 1.7 8.5L16 22.4 8.5 26.7l1.7-8.5-6.4-5.8 8.6-1L16 3.5z"
        fill="currentColor"
        opacity="0.9"
      />
      <text
        x="38"
        y="22"
        fill="currentColor"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="0.5"
      >
        FARGO
      </text>
    </svg>
  );
}
