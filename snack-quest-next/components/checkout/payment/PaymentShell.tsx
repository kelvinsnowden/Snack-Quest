import type { ReactNode } from 'react';

/**
 * The dark canvas every payment-result screen sits on (§ payment screen
 * rebuild).
 *
 * These three screens — waiting, paid, failed — are the only ones in
 * the storefront that are a *moment* rather than a page. The customer
 * is not browsing; they are watching for one answer. So they get their
 * own surface: near-black, full-bleed, with the brand's own lime and
 * orange doing the talking, rather than the light content styling used
 * everywhere else.
 *
 * Committed to a single dark look on purpose, and painted explicitly
 * rather than inherited, so it renders identically whatever theme the
 * rest of the site is in.
 */
export function PaymentShell({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[#0a0510] px-5 py-12 text-white sm:px-6 sm:py-16">
      <BackdropGlow />
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center text-center">{children}</div>
    </section>
  );
}

/**
 * Two soft orbs, the same device the home page's final CTA uses. They
 * give the flat background a light source so the card and the box read
 * as objects sitting on a surface rather than shapes pasted onto black.
 */
function BackdropGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-32 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-secondary/25 blur-3xl" />
      <div className="absolute bottom-0 left-1/2 size-[520px] -translate-x-1/2 translate-y-1/3 rounded-full bg-[#6b21d6]/30 blur-3xl" />
    </div>
  );
}

/**
 * Scattered celebration marks around the status badge.
 *
 * Positions and colours are a fixed table rather than randomised: this
 * renders on the server first, and `Math.random()` would produce
 * different markup on each side of hydration. Fixed also means the
 * composition can actually be judged — a random scatter reliably
 * produces clumps and bald patches.
 *
 * `tone` swaps the palette without changing the layout, so the failed
 * screen keeps the same visual family without looking like a party.
 */
const CONFETTI: Array<{ x: number; y: number; size: number; rotate: number; shape: 'bar' | 'dot' | 'ring' | 'cross' }> = [
  { x: 6, y: 18, size: 10, rotate: -20, shape: 'cross' },
  { x: 16, y: 4, size: 8, rotate: 15, shape: 'bar' },
  { x: 27, y: 30, size: 7, rotate: 0, shape: 'dot' },
  { x: 30, y: 8, size: 9, rotate: 40, shape: 'cross' },
  { x: 44, y: 0, size: 8, rotate: -10, shape: 'bar' },
  { x: 58, y: 6, size: 7, rotate: 25, shape: 'dot' },
  { x: 70, y: 2, size: 10, rotate: -35, shape: 'cross' },
  { x: 79, y: 14, size: 9, rotate: 10, shape: 'bar' },
  { x: 90, y: 8, size: 8, rotate: -15, shape: 'ring' },
  { x: 95, y: 26, size: 7, rotate: 30, shape: 'dot' },
  { x: 2, y: 40, size: 9, rotate: 45, shape: 'bar' },
  { x: 12, y: 58, size: 8, rotate: -25, shape: 'ring' },
  { x: 24, y: 72, size: 7, rotate: 5, shape: 'cross' },
  { x: 40, y: 82, size: 8, rotate: -40, shape: 'bar' },
  { x: 62, y: 78, size: 7, rotate: 20, shape: 'dot' },
  { x: 76, y: 66, size: 9, rotate: -5, shape: 'cross' },
  { x: 88, y: 52, size: 8, rotate: 35, shape: 'bar' },
  { x: 97, y: 70, size: 7, rotate: -30, shape: 'dot' },
];

const FESTIVE = ['#c8ff00', '#ff7a00', '#8a63ff', '#ff4d8d', '#22d3ee', '#facc15'];
const SUBDUED = ['#ff4d5e', '#8a63ff', '#ff7a00', '#64748b', '#c8ff00', '#f472b6'];

export function Confetti({ tone = 'festive' }: { tone?: 'festive' | 'subdued' }) {
  const palette = tone === 'festive' ? FESTIVE : SUBDUED;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {CONFETTI.map((piece, index) => {
        const color = palette[index % palette.length];
        const style = {
          left: `${piece.x}%`,
          top: `${piece.y}%`,
          width: piece.shape === 'bar' ? piece.size / 2.5 : piece.size,
          height: piece.size,
          transform: `rotate(${piece.rotate}deg)`,
          // Staggered so they do not all breathe in unison, which reads
          // as a single blinking layer rather than scattered pieces.
          animationDelay: `${(index % 6) * 0.35}s`,
        };

        if (piece.shape === 'ring') {
          return (
            <span
              key={index}
              className="motion-safe:animate-pulse absolute rounded-full border-2"
              style={{ ...style, borderColor: color }}
            />
          );
        }
        if (piece.shape === 'cross') {
          return (
            <span
              key={index}
              className="motion-safe:animate-pulse absolute"
              style={{
                ...style,
                background: `linear-gradient(${color},${color}) center/100% 34% no-repeat, linear-gradient(${color},${color}) center/34% 100% no-repeat`,
              }}
            />
          );
        }
        return (
          <span
            key={index}
            className={`motion-safe:animate-pulse absolute ${piece.shape === 'dot' ? 'rounded-full' : 'rounded-[2px]'}`}
            style={{ ...style, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
