import { Smartphone, X } from 'lucide-react';
import { Reveal } from '../design/Reveal';

const NOT_NEEDED = ['A shop', 'A warehouse', 'Inventory', 'An office', 'A laptop'];

/**
 * "You don't need 10,000 followers" — one of the strongest
 * differentiators this program has, so it gets its own hook rather
 * than a line buried inside another section (§ Creator Program CRO
 * pass, brief item 5). The creator-type chips exist to remove one
 * specific thought — "I'm too small for this" — by naming the actual
 * shapes an audience can take, not just the follower-count framing.
 *
 * Still deliberately promise-free (carried over from the section this
 * replaces): the point is "you can try", never "you will earn
 * meaningfully" — that's why the effort caveat stays load-bearing, not
 * decorative.
 */
const CREATOR_TYPES = [
  'TikTok creators',
  'Instagram creators',
  'Food creators',
  'Lifestyle creators',
  'Campus creators',
  'Micro-creators',
  'WhatsApp communities',
];

export function CreatorStartHere() {
  return (
    <section className="bg-white px-5 py-16 md:px-10 md:py-32">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div>
            <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">
              No minimum following
            </p>
            <h2 className="font-display mt-4 text-3xl leading-[1.05] font-normal text-balance uppercase md:text-5xl">
              You don&apos;t need 10,000 followers.
            </h2>
            <p className="text-foreground/70 mt-3 max-w-sm text-base md:text-lg">
              You just need people who trust your recommendations.
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {NOT_NEEDED.map((item) => (
                <li key={item} className="text-small text-foreground/60 flex items-center gap-2.5 line-through">
                  <X className="size-4 shrink-0 text-foreground/30" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-foreground mt-6 flex items-center gap-2.5 text-lg font-semibold md:text-xl">
              <Smartphone className="text-secondary size-5 shrink-0" aria-hidden="true" />
              Your phone — and the willingness to learn.
            </p>

            <div className="border-primary/30 bg-primary/5 mt-6 rounded-2xl border p-4">
              <p className="text-small text-foreground/70">
                A low barrier to start doesn&apos;t mean a low barrier to results. You&apos;ll still need to learn,
                post, test, improve and put in the work.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={150}>
          <div className="border-border bg-surface flex h-full flex-col justify-center rounded-3xl border p-7 md:p-10">
            <p className="text-caption text-foreground/60 font-bold tracking-wide uppercase">
              Any of these sound like you?
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {CREATOR_TYPES.map((type) => (
                <span
                  key={type}
                  className="border-secondary/30 bg-secondary/5 text-foreground rounded-full border px-4 py-2 text-sm font-medium"
                >
                  {type}
                </span>
              ))}
            </div>
            <p className="text-foreground/70 mt-6 text-[15px] leading-[1.65] md:text-base">
              If people already ask you what to buy, watch, or try — that&apos;s the audience this program is
              built for.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
