import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { verifyOptOutToken } from '@/lib/sms/optOutLink';
import { OptOutConfirm } from '@/components/marketing/sms/OptOutConfirm';

/**
 * `/s/{token}` — where the opt-out link in a marketing SMS lands
 * (§ marketing SMS opt-out).
 *
 * The single-letter path is not laziness: it is paid for out of the
 * same 160-character segment as the message itself, and the difference
 * between this and `/sms/stop/` is enough to decide whether an ordinary
 * campaign costs one segment or two. See `lib/sms/optOutLink.ts`.
 *
 * Deliberately `noindex`: these URLs contain a signed phone number and
 * exist for exactly one recipient. There is nothing here for a search
 * engine, and every reason not to have per-customer URLs in an index.
 */
export const metadata: Metadata = {
  title: 'Stop marketing texts',
  robots: { index: false, follow: false },
};

/** `254712345678` → `07** *** 678`. Enough for the recipient to recognise their own number, not enough to be worth harvesting from a URL someone else got hold of. */
function maskPhone(phoneNumber: string): string {
  const subscriber = phoneNumber.slice(3);
  return `0${subscriber.slice(0, 1)}** *** ${subscriber.slice(-3)}`;
}

export default async function SmsOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const phoneNumber = verifyOptOutToken(token);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-5 py-12 sm:px-6 sm:py-16">
      {phoneNumber ? (
        <OptOutConfirm token={token} maskedPhone={maskPhone(phoneNumber)} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">This link isn&rsquo;t valid</h1>
          <p className="max-w-md text-pretty text-base text-muted-foreground">
            It may have been copied incompletely. Open the link straight from the text message, or reply to us on
            WhatsApp and we&rsquo;ll take you off the list ourselves.
          </p>
          <Link href="/contact" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Contact us
          </Link>
        </div>
      )}
    </div>
  );
}
