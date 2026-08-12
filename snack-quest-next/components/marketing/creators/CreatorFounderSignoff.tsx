import { Reveal } from '../design/Reveal';

/**
 * The closing personal note, deliberately small (§ founder story
 * integration) — the emotional weight already landed in
 * `CreatorFounderStory` up top; this is a quiet last word before
 * `CreatorsFinalCta` makes the actual ask, not a second essay.
 */
export function CreatorFounderSignoff() {
  return (
    <section className="bg-background px-5 py-14 md:px-10 md:py-24">
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-foreground/80 text-lg leading-relaxed md:text-xl">
            I don&apos;t know exactly how far Snack Quest will go. I&apos;m still building it, still figuring parts
            of it out as I go.
          </p>
          <p className="text-foreground mt-4 text-lg leading-relaxed font-semibold md:text-xl">
            But I know I don&apos;t want to build it for people. I want to build it with people.
            <br />
            You&apos;re one of those people now.
          </p>

          <div className="mt-7">
            <p className="font-signature text-3xl text-secondary italic md:text-4xl">Kelvin</p>
            <p className="mt-1 text-caption font-semibold tracking-[0.25em] text-foreground/60 uppercase">
              Founder, Snack Quest
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
