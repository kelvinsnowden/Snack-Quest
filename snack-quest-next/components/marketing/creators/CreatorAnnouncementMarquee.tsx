/**
 * The hero's opening hook, in motion (§ Creator Program CRO pass) —
 * placed above the "Creator program" pill, this is the very first
 * thing a visitor's eye catches on the page. Unlike `PartnersMarquee`
 * (a calm, read-the-logos strip), this one is built to be loud: a
 * saturated brand-gradient bar and bold uppercase white text — but
 * still readable, which the first pass wasn't (`animate-marquee-fast`
 * doc comment in `globals.css` has the actual px/s math). Speed is a
 * function of both animation duration and how much text has to
 * travel in it, so `REPEAT_COUNT` came down from 4 to 3 as well —
 * still comfortably enough copies to cover an ultra-wide viewport
 * with no gap, just not so many that the same 30s duration had to
 * cover more ground per second than a reader could follow.
 *
 * Plain "•" separators, not an icon — a sparkle between every repeat
 * across three copies read as visual noise rather than emphasis.
 *
 * Sentence-cased in source, `uppercase` applied via class — same
 * convention every heading on this site follows, so a screen reader
 * gets normal words instead of letter-by-letter shouting.
 */
const MESSAGE_LEAD = 'Stop waiting for brands to notice you';
const MESSAGE_TAIL = 'Buy one box, create content & start monetizing your audience';
const REPEAT_COUNT = 3;

function AnnouncementUnit() {
  return (
    <span className="flex shrink-0 items-center gap-3 px-4 whitespace-nowrap">
      <span>{MESSAGE_LEAD}</span>
      <span aria-hidden="true">•</span>
      <span>{MESSAGE_TAIL}</span>
      <span aria-hidden="true">•</span>
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
