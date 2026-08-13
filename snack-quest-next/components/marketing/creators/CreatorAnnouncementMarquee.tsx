import { Sparkles } from 'lucide-react';

/**
 * The hero's opening hook, in motion (§ Creator Program CRO pass) —
 * placed above the "Creator program" pill, this is the very first
 * thing a visitor's eye catches on the page. Unlike `PartnersMarquee`
 * (a calm, read-the-logos strip), this one is built to be loud: a
 * saturated brand-gradient bar, bold uppercase white text, and a
 * faster scroll (`animate-marquee-fast`, see its doc comment in
 * `globals.css` for the seamless-loop mechanics it shares with the
 * partner marquee).
 *
 * Sentence-cased in source, `uppercase` applied via class — same
 * convention every heading on this site follows, so a screen reader
 * gets normal words instead of letter-by-letter shouting.
 */
const MESSAGE_LEAD = 'Stop waiting for brands to notice you';
const MESSAGE_TAIL = 'Buy one box, create content & start monetizing your audience';
const REPEAT_COUNT = 4;

function AnnouncementUnit() {
  return (
    <span className="flex shrink-0 items-center gap-3 px-4 whitespace-nowrap">
      <span>{MESSAGE_LEAD}</span>
      <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{MESSAGE_TAIL}</span>
      <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
    </span>
  );
}

function AnnouncementTrack() {
  return (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: REPEAT_COUNT }, (_, i) => (
        <AnnouncementUnit key={i} />
      ))}
    </div>
  );
}

export function CreatorAnnouncementMarquee() {
  return (
    <div className="marquee-pause-on-hover from-primary via-secondary to-primary overflow-hidden bg-gradient-to-r py-2.5 shadow-[0_4px_20px_-4px_rgb(255_122_0/0.4)]">
      <div
        aria-hidden="true"
        className="animate-marquee-fast text-caption flex w-max items-center font-bold tracking-wide text-white uppercase"
      >
        <AnnouncementTrack />
        <AnnouncementTrack />
      </div>
      <p className="sr-only">
        {MESSAGE_LEAD}. {MESSAGE_TAIL}.
      </p>
    </div>
  );
}
