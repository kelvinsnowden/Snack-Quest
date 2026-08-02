import {
  Briefcase,
  Cake,
  Check,
  GraduationCap,
  Gift,
  Heart,
  PartyPopper,
  ShieldCheck,
  TreePine,
} from 'lucide-react';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Reveal } from './Reveal';
import { PRIMARY_CTA_CLASS } from './styles';

const OCCASIONS: Array<{ label: string; emoji: string; icon: typeof Cake; accent: 'primary' | 'secondary' | 'home-lime' }> = [
  { label: 'Birthdays', emoji: '🎂', icon: Cake, accent: 'primary' },
  { label: 'Anniversary', emoji: '❤️', icon: Heart, accent: 'secondary' },
  { label: 'Graduation', emoji: '🎓', icon: GraduationCap, accent: 'home-lime' },
  { label: 'Christmas', emoji: '🎄', icon: TreePine, accent: 'primary' },
  { label: 'Just Because', emoji: '💝', icon: Gift, accent: 'secondary' },
  { label: 'Congrats', emoji: '🎉', icon: PartyPopper, accent: 'home-lime' },
  { label: 'Corporate Gifting', emoji: '💼', icon: Briefcase, accent: 'secondary' },
];

const CHECKLIST = [
  'Every box is a surprise, not another mug',
  "Unique imported snacks they can't buy locally",
  'Beautiful, gift-ready presentation',
  'Delivered anywhere in Kenya in 24–48 hours',
  "Don't love a snack? We'll make it right, guaranteed",
];

const ACCENT_TILE: Record<string, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  'home-lime': 'bg-home-lime',
};

const ACCENT_ICON: Record<string, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  'home-lime': 'text-foreground',
};

export function GiftIt({ whatsappCustomerNumber }: { whatsappCustomerNumber: string | null }) {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-20 md:px-10 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 size-[500px] rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 size-[500px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <Reveal>
          <p className="text-caption font-bold tracking-[0.3em] text-primary uppercase">Gift it</p>
          <h2 className="mt-4 text-balance font-display text-5xl leading-[1] font-normal uppercase md:text-6xl">
            Give the gift of <span className="text-secondary">surprise.</span>
          </h2>
          <p className="mt-5 max-w-[512px] text-lg text-foreground/75">
            For anyone tired of gifting the same predictable mug, wine, or generic hamper — Snack Quest is the gift
            that gets talked about, filmed, and remembered long after it&apos;s opened.
          </p>
        </Reveal>

        <Reveal delayMs={120}>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {OCCASIONS.map((occasion, index) => (
              <div
                key={occasion.label}
                className="group flex flex-col items-start gap-2 rounded-2xl border border-foreground/5 bg-background p-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg"
                style={{ transitionDelay: `${index * 60}ms` }}
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${ACCENT_TILE[occasion.accent]}`}
                >
                  <occasion.icon className={`size-5 ${ACCENT_ICON[occasion.accent]}`} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="flex items-center gap-1.5 text-small font-semibold text-foreground">
                  <span aria-hidden="true">{occasion.emoji}</span>
                  {occasion.label}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delayMs={200}>
          <div className="mt-10 rounded-3xl border border-foreground/5 bg-gradient-to-br from-background to-white p-6 md:p-7">
            <p className="text-caption font-bold tracking-[0.25em] text-secondary uppercase">
              Why it makes the perfect gift
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-small text-foreground/80">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-home-lime">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-primary/10 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
              <p className="text-small text-foreground/80">
                <span className="font-bold text-foreground">The Snack Quest Promise:</span> Every snack in your box
                has been personally tasted and approved by the Snack Quest team before earning its place. We
                carefully curate each mystery box to deliver an unforgettable adventure from the first bite to the
                last. If your order arrives damaged or incomplete, we&apos;ll make it right—quickly.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={280}>
          <div className="mt-8">
            <WhatsAppOrderButton
              whatsappCustomerNumber={whatsappCustomerNumber}
              message="Hi! I'd like to send a Snack Quest box as a gift."
              size="lg"
              className={PRIMARY_CTA_CLASS}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
