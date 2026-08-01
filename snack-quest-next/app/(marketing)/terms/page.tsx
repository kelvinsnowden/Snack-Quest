import type { Metadata } from 'next';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';

export const metadata: Metadata = { title: 'Terms of service' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-card-title font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default async function TermsPage() {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-page-title font-bold tracking-tight text-foreground">Terms of service</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        These terms cover ordering from {businessName} and joining our Creator Program. By messaging us to place
        an order, or by registering as a creator, you agree to them.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        <Section title="Orders">
          <ul className="ml-4 list-disc space-y-1">
            <li>An order is confirmed once you reply PAY and complete the M-Pesa payment prompt we send.</li>
            <li>Prices are shown in Kenyan Shillings (KES) and may change without notice for future orders.</li>
            <li>We reserve the right to decline or cancel an order — for example, if a box is out of stock — and will refund any payment already made.</li>
          </ul>
        </Section>

        <Section title="Delivery">
          <ul className="ml-4 list-disc space-y-1">
            <li>Delivery timelines depend on your location and chosen delivery method, and are estimates, not guarantees.</li>
            <li>You&apos;re responsible for providing an accurate delivery address or pickup station, and for being reachable on the phone number you order with.</li>
            <li>If a delivery attempt fails because we can&apos;t reach you or the address is wrong, additional delivery fees may apply to redeliver.</li>
          </ul>
        </Section>

        <Section title="Payments">
          <p>
            All payments are processed through M-Pesa via Safaricom&apos;s Daraja platform. We don&apos;t store
            your M-Pesa PIN or full card/account details.
          </p>
        </Section>

        <Section title="Refunds">
          <p>
            If your order arrives damaged, incorrect, or not at all, message us on WhatsApp with your order
            details. We&apos;ll investigate and, where appropriate, issue a refund back to the M-Pesa number the
            payment came from.
          </p>
        </Section>

        <Section title="Creator Program">
          <ul className="ml-4 list-disc space-y-1">
            <li>Creators earn commission on orders genuinely attributed to their own referral link — manipulating clicks, self-referring in bad faith, or fraudulent activity may result in forfeited commission and removal from the program.</li>
            <li>Commission balances can be withdrawn to a valid M-Pesa number, subject to the minimum balance shown in your creator dashboard at the time.</li>
            <li>We may suspend or remove a creator account for violating these terms or for suspected fraud.</li>
          </ul>
        </Section>

        <Section title="Changes to these terms">
          <p>We may update these terms as our service changes. Continuing to order or refer customers after an update means you accept the revised terms.</p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Reach us through our{' '}
            <a href="/contact" className="text-primary hover:underline">contact page</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
