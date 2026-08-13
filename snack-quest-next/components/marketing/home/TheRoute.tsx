'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { MpesaLogo } from '@/components/icons/MpesaLogo';
import { JumiaIcon } from '@/components/icons/JumiaIcon';
import { BoltIcon } from '@/components/icons/BoltIcon';

/**
 * What each checkpoint badge shows (§ real-logo pass) — `emoji` stays
 * for checkpoints with no real brand behind them (there's no "Begin
 * Your Snack Adventure" logo to show), while `logo`/`mpesa`/`jumia`/
 * `bolt` render the actual brand: the Snack Quest mark for step 1, and
 * the real payment/delivery partners for the steps that are genuinely
 * about them — step 2 is the M-Pesa prompt, step 3 is fulfilled by
 * either Jumia pickup or Bolt door delivery, hence two badges there
 * instead of one.
 */
type Badge =
  | { kind: 'emoji'; value: string }
  | { kind: 'logo'; src: string; alt: string }
  | { kind: 'mpesa' }
  | { kind: 'jumia' }
  | { kind: 'bolt' };

interface Checkpoint {
  badges: Badge[];
  title: string;
  body: string;
}

const CHECKPOINTS: Checkpoint[] = [
  {
    badges: [{ kind: 'logo', src: '/logo.png', alt: 'Snack Quest' }],
    title: 'Choose Your Box',
    body: 'Starter, Deluxe, or Premium. Pick your size, takes about 30 seconds.',
  },
  {
    badges: [{ kind: 'mpesa' }],
    title: 'Check Out & Pay',
    body: 'Fill in where it goes, see your total, and approve the M-Pesa prompt on your phone. No account needed.',
  },
  {
    badges: [{ kind: 'jumia' }, { kind: 'bolt' }],
    title: 'Fast Delivery Across Kenya',
    body: 'Hand-packed within 24 hours. Jumia pickup stations countrywide, or Bolt Package to your door in Nairobi.',
  },
  {
    badges: [{ kind: 'emoji', value: '🎉' }],
    title: 'Begin Your Snack Adventure',
    body: 'Unbox it yourself, or hand it to someone who needs a good surprise. Either way, the reaction is the best part.',
  },
];

const FIREFLIES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 53) % 100,
  top: (i * 37) % 100,
  duration: 4 + (i % 6),
  delay: i % 5,
}));

function TrailSvg({ progress }: { progress: number }) {
  const dashOffset = 1800 - progress * 1800;
  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
      viewBox="0 0 400 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trail-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="50%" stopColor="var(--color-home-lime)" />
          <stop offset="100%" stopColor="var(--color-secondary)" />
        </linearGradient>
      </defs>
      <path
        d="M200 30 C 80 180, 320 320, 200 480 S 80 720, 200 970"
        stroke="rgba(255,248,238,0.15)"
        strokeWidth="3"
        strokeDasharray="6 10"
        fill="none"
      />
      <path
        d="M200 30 C 80 180, 320 320, 200 480 S 80 720, 200 970"
        stroke="url(#trail-gradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1800"
        strokeDashoffset={dashOffset}
        fill="none"
        style={{ transition: 'stroke-dashoffset 200ms linear' }}
      />
    </svg>
  );
}

/** The one thing that renders inside a badge circle — logo image, real brand mark, or the emoji fallback. */
function BadgeGlyph({ badge, wide }: { badge: Badge; wide: string }) {
  switch (badge.kind) {
    case 'logo':
      return (
        <Image
          src={badge.src}
          alt={badge.alt}
          width={80}
          height={80}
          className="size-full rounded-full object-cover"
        />
      );
    case 'mpesa':
      return <MpesaLogo className={wide} />;
    case 'jumia':
      return <JumiaIcon className={wide} />;
    case 'bolt':
      return <BoltIcon className={wide} />;
    case 'emoji':
      return (
        <span className="text-2xl md:text-3xl" aria-hidden="true">
          {badge.value}
        </span>
      );
  }
}

/**
 * A real logo (mpesa/jumia/bolt) is designed for a white background —
 * unlike the Snack Quest mark, which already carries its own dark
 * backdrop, or the emoji, which reads fine on the section's own dark
 * green. `bg-white` plus padding only applies to those three, so
 * nothing gets recoloured to fit the dark "expedition" palette.
 */
function BadgeCircle({ badge, active, dual }: { badge: Badge; active: boolean; dual: boolean }) {
  const isRealLogo = badge.kind === 'mpesa' || badge.kind === 'jumia' || badge.kind === 'bolt';
  return (
    <div
      className={[
        'flex items-center justify-center overflow-hidden rounded-full border-2 transition-all duration-700',
        dual ? 'size-12 md:size-16' : 'size-16 md:size-20',
        isRealLogo ? (dual ? 'bg-white p-2' : 'bg-white p-2.5 md:p-3') : '',
        active
          ? `scale-100 border-home-lime shadow-[0_0_40px_-5px_rgb(200_255_0/0.7)] ${isRealLogo ? '' : 'bg-foreground'}`
          : `scale-90 border-white/20 ${isRealLogo ? '' : 'bg-foreground/60'}`,
      ].join(' ')}
    >
      <BadgeGlyph badge={badge} wide={dual ? 'w-8 md:w-10' : 'w-11 md:w-14'} />
    </div>
  );
}

function CheckpointItem({ checkpoint, index }: { checkpoint: Checkpoint; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [active, setActive] = useState(false);
  const isRightSide = index % 2 === 1;

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) {
      setActive(true);
      return;
    }
    const node = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      className={`grid grid-cols-[auto_1fr] items-center gap-5 md:grid-cols-2 md:gap-10 ${
        isRightSide ? 'md:text-right' : ''
      }`}
    >
      <div className={`relative z-10 flex justify-center ${isRightSide ? 'md:order-2' : ''}`}>
        <div className="relative flex items-center gap-2 md:gap-3">
          {checkpoint.badges.map((badge, badgeIndex) => (
            <BadgeCircle
              key={badgeIndex}
              badge={badge}
              active={active}
              dual={checkpoint.badges.length > 1}
            />
          ))}
          <span className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full bg-primary text-caption font-bold text-white shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)]">
            {index + 1}
          </span>
          {active ? (
            <>
              <span
                className="absolute -bottom-6 -left-8 hidden text-home-lime/50 opacity-0 transition-opacity delay-200 duration-[800ms] md:block"
                style={{ opacity: active ? 0.5 : 0 }}
                aria-hidden="true"
              >
                🐾
              </span>
              <span
                className="absolute -top-6 -right-8 hidden text-home-lime/40 opacity-0 transition-opacity delay-[400ms] duration-[800ms] md:block"
                style={{ opacity: active ? 0.4 : 0 }}
                aria-hidden="true"
              >
                🐾
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`transition-all duration-700 ${active ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${
          isRightSide ? 'md:order-1' : ''
        }`}
      >
        <p className="text-caption font-bold tracking-wide text-home-lime/80 uppercase">Step {index + 1}</p>
        <h3 className="mt-2 font-display text-2xl leading-[1.1] font-normal text-white uppercase md:text-4xl">
          {checkpoint.title}
        </h3>
        <p className="mt-3 max-w-[448px] text-base text-white/70 md:text-lg">{checkpoint.body}</p>
      </div>
    </li>
  );
}

/**
 * The dark jungle "expedition" section (§ spec §7.4) — removes
 * friction objections by showing exactly how ordering, packing, and
 * delivery work. Client component for the scroll-linked trail and
 * per-checkpoint reveal.
 */
export function TheRoute() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const node = sectionRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const raw = (viewportHeight - rect.top) / (rect.height + viewportHeight);
      setProgress(Math.min(1, Math.max(0, raw)));
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden px-5 py-16 md:px-10 md:py-36"
      style={{
        background:
          'radial-gradient(ellipse at top, oklch(0.32 0.09 155) 0%, oklch(0.20 0.07 160) 55%, oklch(0.14 0.05 165) 100%)',
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/10 to-transparent blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/40 to-transparent" />
        {FIREFLIES.map((firefly, i) => (
          <span
            key={i}
            className="absolute size-1.5 rounded-full bg-home-lime opacity-75 shadow-[0_0_12px_4px_rgb(200_255_0/0.7)]"
            style={{
              left: `${firefly.left}%`,
              top: `${firefly.top}%`,
              animation: `floatSlow ${firefly.duration}s ease-in-out infinite`,
              animationDelay: `${firefly.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-2xl text-center">
        <p className="text-caption font-bold tracking-[0.3em] text-home-lime uppercase">The route</p>
        <h2 className="mt-4 text-balance font-display text-4xl leading-[1.05] font-normal text-white uppercase md:text-6xl">
          From your screen to your <span className="text-home-lime">door.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[512px] text-base text-white/70 md:text-lg">
          Four checkpoints. Two minutes to order. Two days to your door.
        </p>
      </div>

      <div className="relative mx-auto mt-10 max-w-4xl md:mt-20">
        <TrailSvg progress={progress} />
        <ol className="relative flex flex-col gap-10 md:gap-24">
          {CHECKPOINTS.map((checkpoint, index) => (
            <CheckpointItem key={checkpoint.title} checkpoint={checkpoint} index={index} />
          ))}
        </ol>
      </div>
    </section>
  );
}
