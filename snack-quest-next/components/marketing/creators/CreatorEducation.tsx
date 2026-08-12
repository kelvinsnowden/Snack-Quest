import { Reveal } from '../design/Reveal';

const SKILLS = ['Content', 'Audience', 'Offers', 'Marketing', 'Paid ads', 'Conversions', 'Testing'];

/**
 * The program is also a beginner-friendly classroom, not just a
 * referral link (§ founder story integration) — deliberately no
 * "become an expert overnight" claims, just naming the real skills the
 * resources cover so this reads as a specific commitment, not hype.
 */
export function CreatorEducation() {
  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">For beginners too</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            You don&apos;t need to know how to make money online <span className="text-secondary">yet.</span>
          </h2>
          <p className="text-foreground/70 mx-auto mt-5 max-w-[512px] text-base md:text-lg">
            Some of you have done this before. Many of you haven&apos;t. This program is built for both.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="border-border bg-surface mx-auto mt-10 max-w-3xl rounded-3xl border p-7 md:mt-16 md:p-10">
          <h3 className="font-display text-2xl leading-[1.1] font-normal uppercase md:text-3xl">
            I&apos;m not just giving you a link.
          </h3>
          <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65] md:text-base">
            I&apos;ve built real resources to help you learn how this actually works — not just for Snack Quest,
            but for online business in general.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <span
                key={skill}
                className="border-border text-small rounded-full border bg-white px-3.5 py-1.5 font-semibold text-foreground/80"
              >
                {skill}
              </span>
            ))}
          </div>

          <p className="text-foreground mt-7 text-lg font-semibold md:text-xl">
            Snack Quest might be your first experience with online business.
            <br />
            It doesn&apos;t have to be your last.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
