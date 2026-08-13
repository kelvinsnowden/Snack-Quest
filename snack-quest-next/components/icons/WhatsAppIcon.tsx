/**
 * The real WhatsApp glyph (§ real WhatsApp icon on every WhatsApp CTA)
 * — every WhatsApp call-to-action on the site used a generic chat-
 * bubble icon (lucide's `MessageCircle`) that reads as "message us"
 * in the abstract, not specifically WhatsApp. This is the actual mark,
 * inlined as SVG path data rather than pulled from a new icon-library
 * dependency for one glyph.
 *
 * Drop-in replacement for a lucide icon at every call site: same
 * `className`/`aria-hidden` props, same `size-*` sizing convention.
 */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.001 2C6.478 2 2 6.478 2 12c0 1.85.505 3.58 1.383 5.06L2.05 22l5.06-1.328A9.953 9.953 0 0 0 12.001 22c5.523 0 10-4.477 10-10s-4.477-10-10-10Zm5.895 14.208c-.246.694-1.223 1.269-1.994 1.435-.53.113-1.223.203-3.556-.764-2.984-1.236-4.906-4.27-5.056-4.469-.144-.199-1.209-1.61-1.209-3.07 0-1.46.75-2.176 1.017-2.474.246-.273.535-.34.713-.34.179 0 .357.002.513.01.164.008.386-.062.604.461.246.578.836 1.99.909 2.135.074.144.123.313.024.512-.098.199-.147.323-.29.497-.145.174-.302.388-.431.52-.144.144-.294.301-.126.591.169.29.75 1.24 1.611 2.008 1.107.988 2.04 1.294 2.33 1.44.29.144.46.12.629-.074.169-.194.723-.844.916-1.134.193-.29.386-.24.65-.144.264.096 1.677.79 1.964.934.288.144.48.216.552.336.072.121.072.696-.174 1.39Z" />
    </svg>
  );
}
