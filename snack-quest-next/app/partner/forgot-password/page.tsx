import type { Metadata } from 'next';
import { AuthShell } from '@/components/creator/design/AuthShell';
import { RequestPasswordLinkForm } from '@/components/partner/RequestPasswordLinkForm';

export const metadata: Metadata = {
  title: 'Create or reset your password — Snack Quest Owners',
};

export const dynamic = 'force-dynamic';

/** First time here, lost the login email, or forgot the password: the same answer — a link to create one. */
export default async function PartnerForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = '' } = await searchParams;
  return (
    <AuthShell title="Create your password" description="First time here, or forgot your password? We’ll email you a link to set it.">
      <RequestPasswordLinkForm initialEmail={email} />
    </AuthShell>
  );
}
