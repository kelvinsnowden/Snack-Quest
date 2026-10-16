import type { Metadata } from 'next';
import { verifyLeadToken } from '@/lib/leads/leadLinks';
import { leadNurtureService } from '@/services/leadNurtureService';
import { CallBooking } from '@/components/marketing/leads/CallBooking';
import { InvalidLeadLink } from '@/components/marketing/leads/InvalidLeadLink';

/**
 * `/call/{token}` — where the "Book a WhatsApp call" button in the lead
 * nurture emails lands (§ lead nurture). The token is signed per lead,
 * so the page knows who is booking without asking them to sign in.
 * `noindex`: one URL per person, nothing for a search engine.
 */
export const metadata: Metadata = {
  title: 'Book a WhatsApp call',
  robots: { index: false, follow: false },
};

export default async function BookCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const leadId = verifyLeadToken(token);
  const view = leadId ? await leadNurtureService.bookingView(leadId) : null;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
      {view ? (
        <CallBooking
          token={token}
          firstName={view.firstName}
          defaultWhatsapp={view.whatsapp}
          bookedAtMs={view.bookedAtMs}
          days={view.days}
        />
      ) : (
        <InvalidLeadLink />
      )}
    </div>
  );
}
