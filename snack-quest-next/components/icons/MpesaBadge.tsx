/**
 * A real M-Pesa reference, not an emoji or an invented logo (§ Creator
 * Program CRO pass) — this codebase has no M-Pesa logo asset anywhere
 * (checkout only ever names it in text, see `MPESA_RECIPIENT_NAME`
 * usage in `CheckoutForm.tsx`), and redrawing Safaricom's actual
 * trademarked wordmark artwork from memory risks getting it wrong in a
 * way a phone-shaped emoji never could. This is the same solution
 * fintech partner pages use for a brand they integrate with but don't
 * own artwork for: the real product name, set in the real M-Pesa
 * green, as a badge rather than a sentence.
 */
export function MpesaBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-[#4CAF50] px-2 py-0.5 text-[11px] font-extrabold tracking-tight text-white ${className ?? ''}`}
    >
      M-PESA
    </span>
  );
}
