import type { Metadata } from 'next';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy policy',
  description: 'How Snack Quest collects, uses, and protects your personal data across website checkout, WhatsApp support, and the Creator Program.',
  path: '/privacy',
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-card-title font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title font-bold tracking-tight text-foreground">Privacy policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This policy explains what {businessName} collects, why, and how it&apos;s used. It applies to our
        website checkout, our WhatsApp support channel, and the Creator Program.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        <Section title="What we collect">
          <p>When you check out on our website, or message us on WhatsApp, we collect:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Your name, phone number, and delivery address or chosen pickup station.</li>
            <li>Order details: the box(es) you chose, price, and delivery method.</li>
            <li>Payment confirmation details from M-Pesa (via Safaricom&apos;s Daraja API). We never see or store your M-Pesa PIN.</li>
            <li>Your WhatsApp messages with us, so we can respond and keep a record of the conversation.</li>
            <li>If you leave a review, the name you give us, your review, any photos you attach, and the phone number you optionally provide so we can reach you about it.</li>
          </ul>
          <p>We do not ask you to create an account or set a password to buy from us.</p>
          <p>If you join the Creator Program, we also collect your referral activity: link clicks, orders attributed to your link, and commission earned.</p>
        </Section>

        <Section title="How we use it">
          <ul className="ml-4 list-disc space-y-1">
            <li>To process and deliver your order, including booking a courier on your behalf.</li>
            <li>To confirm payment and resolve payment issues.</li>
            <li>To respond to questions and support requests.</li>
            <li>To calculate and pay creator commissions.</li>
            <li>To measure how customers find us (for example, ads on Meta platforms), using aggregated, non-identifying signals where possible.</li>
          </ul>
        </Section>

        <Section title="Who we share it with">
          <p>We share the minimum information needed to fulfil your order with:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Safaricom, to process M-Pesa payments.</li>
            <li>Our courier partners, to deliver your order: your name, phone number, and delivery address only.</li>
            <li>Our WhatsApp Business API provider, to send and receive messages.</li>
          </ul>
          <p>We do not sell your personal data to anyone.</p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep order and payment records for as long as needed for accounting, tax, and dispute-resolution
            purposes. You can ask us to delete your data at any time, subject to records we&apos;re legally
            required to keep.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the Kenya Data Protection Act, you can ask us what personal data we hold about you, ask us to
            correct it, or ask us to delete it. Message us on WhatsApp or use our{' '}
            <a href="/contact" className="text-primary hover:underline">contact page</a> to make a request.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>We may update this policy as our service changes. We&apos;ll post the latest version here.</p>
        </Section>
      </div>
    </div>
  );
}
