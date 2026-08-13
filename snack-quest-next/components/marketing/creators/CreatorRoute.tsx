import { Reveal } from '../design/Reveal';

/**
 * The creator's four steps, in the same dark "expedition" treatment the
 * home page uses for the customer's four steps (§ brand consistency
 * pass) — same radial jungle gradient, same lime kicker, same drifting
 * fireflies, same numbered checkpoints.
 *
 * A server component, unlike the home page's `TheRoute`: that one is a
 * client component only because of its scroll-linked trail SVG, and
 * four short steps do not need one. The `Reveal` stagger carries the
 * same sense of the page unfolding without shipping the JavaScript.
 */
const STEPS = [
  {
    emoji: '✍️',
    title: 'Sign up',
    body: 'Name, email, password. Two minutes and you’re in.',
  },
  {
    emoji: '🔗',
    title: 'Grab your link',
    body: 'Copy it from your dashboard and drop it wherever your audience already hangs out.',
  },
  {
    emoji: '📈',
    title: 'They order, you earn',
    body: 'Their discount applies itself at checkout. Your commission lands the moment they pay.',
  },
  {
    emoji: '💸',
    title: 'Cash out to M-Pesa',
    body: 'Request a withdrawal from your dashboard whenever your balance is worth moving.',
  },
];

const FIREFLIES = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 47) % 100,
  top: (i * 41) % 100,
  duration: 4 + (i % 5),
  delay: i % 4,
}));

export function CreatorRoute() {
  return (
    <section
      className="relative overflow-hidden px-5 py-16 md:px-10 md:py-32"
      style={{
        background:
          'radial-gradient(ellipse at top, oklch(0.34 0.13 300) 0%, oklch(0.22 0.11 297) 55%, oklch(0.15 0.08 295) 100%)',
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/10 to-transparent blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/40 to-transparent" />
        {FIREFLIES.map((firefly, i) => (
          <span
            key={i}
            className="bg-home-lime absolute size-1.5 rounded-full opacity-75 shadow-[0_0_12px_4px_rgb(200_255_0/0.7)]"
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
        <p className="text-caption text-home-lime font-bold tracking-[0.3em] uppercase">
          How it works
        </p>
        <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance text-white uppercase md:text-6xl">
          From your post to your <span className="text-home-lime">M-Pesa.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[512px] text-base text-white/70 md:text-lg">
          Four steps. The longest one is choosing what to say about us.
        </p>
      </div>

      <ol className="relative mx-auto mt-10 grid max-w-5xl gap-6 md:mt-16 md:grid-cols-4">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} as="li" delayMs={index * 90}>
            <div className="flex h-full flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm md:items-start md:text-left">
              <div className="relative">
                <span className="border-home-lime bg-foreground flex size-14 items-center justify-center rounded-full border-2 text-2xl shadow-[0_0_40px_-5px_rgb(200_255_0/0.7)]">
                  <span aria-hidden="true">{step.emoji}</span>
                </span>
                <span className="bg-secondary text-caption absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full font-bold text-white">
                  {index + 1}
                </span>
              </div>
              <div>
                <h3 className="font-display text-xl leading-[1.1] font-normal text-white uppercase md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{step.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
