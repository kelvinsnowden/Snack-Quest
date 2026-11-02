import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { AuthShell } from '@/components/creator/design/AuthShell';
import { SetPasswordForm } from '@/components/partner/SetPasswordForm';
import { RequestPasswordLinkForm } from '@/components/partner/RequestPasswordLinkForm';
import { partnerPortalAccessService, linkProblemMessage } from '@/services/partnerPortalAccessService';

export const metadata: Metadata = {
  title: 'Create your password — Snack Quest Owners',
  robots: { index: false },
};

// The link is checked on every visit: never prerendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Where the link in an owner's login email lands: create a password, then
 * sign in. A link that's used, expired or wrong says so, and offers a new one
 * right here.
 */
export default async function PartnerSetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const link = await partnerPortalAccessService.describeLink(token);

  if (!link.ok) {
    return (
      <AuthShell title="Get a new link" description="This link can’t be used to create a password.">
        <div className="flex flex-col gap-5">
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {linkProblemMessage(link.problem)}
          </p>
          {link.problem === 'suspended' ? null : <RequestPasswordLinkForm initialEmail={link.email ?? ''} />}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={link.purpose === 'invite' ? `Welcome, ${link.name}` : 'Set a new password'}
      description={link.purpose === 'invite' ? 'Create a password for your Owner Portal. You’ll sign in with it next.' : 'Choose a new password. You’ll sign in with it next.'}
    >
      <SetPasswordForm token={token} email={link.email} />
    </AuthShell>
  );
}
