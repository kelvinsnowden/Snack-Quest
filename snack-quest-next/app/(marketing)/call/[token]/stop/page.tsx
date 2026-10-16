import type { Metadata } from 'next';
import { verifyLeadToken } from '@/lib/leads/leadLinks';
import { StopLeadEmails } from '@/components/marketing/leads/StopLeadEmails';
import { InvalidLeadLink } from '@/components/marketing/leads/InvalidLeadLink';

/**
 * `/call/{token}/stop` — the unsubscribe link in every lead nurture
 * email. A button rather than unsubscribing on load, because email link
 * scanners open URLs on their own.
 */
export const metadata: Metadata = {
  title: 'Stop emails',
  robots: { index: false, follow: false },
};

export default async function StopLeadEmailsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = verifyLeadToken(token) !== null;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
      {valid ? <StopLeadEmails token={token} /> : <InvalidLeadLink />}
    </div>
  );
}
