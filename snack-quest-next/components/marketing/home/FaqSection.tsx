import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Reveal } from '../design/Reveal';
import type { Faq } from '@/types';

/**
 * Same live, Admin-managed FAQ data as the standalone `/faq` page
 * (§ Admin: FAQ), in the homepage's own section shell — kicker +
 * display heading + Reveal stagger, matching every other section on
 * this page — so a visitor who scrolls this far never has to leave to
 * get an answer.
 */
export function FaqSection({ faqs }: { faqs: Faq[] }) {
  if (faqs.length === 0) {
    return null;
  }

  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">
            Before you set off
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Questions, <span className="text-secondary">answered.</span>
          </h2>
          <p className="text-foreground/70 mx-auto mt-5 max-w-[512px] text-base md:text-lg">
            Everything explorers ask before their first order.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={150}>
        <div className="divide-border border-border bg-surface mx-auto mt-10 flex max-w-3xl flex-col divide-y rounded-2xl border md:mt-16">
          {faqs.map((faq) => (
            <details key={faq.question} className="group px-5 py-4 md:px-7 md:py-5">
              <summary className="text-foreground marker:content-none flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold md:text-card-title">
                {faq.question}
                <span className="text-muted-foreground shrink-0 text-xl transition-transform group-open:rotate-45 md:text-2xl">
                  +
                </span>
              </summary>
              <p className="text-muted-foreground mt-2 text-sm md:mt-3">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Reveal>

      <Reveal delayMs={250}>
        <div className="mt-10 text-center">
          <WhatsAppOrderButton message="Hi! I have a question.">
            Ask us on WhatsApp
          </WhatsAppOrderButton>
        </div>
      </Reveal>
    </section>
  );
}
