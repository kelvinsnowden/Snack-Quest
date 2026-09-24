import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PartnerLoginForm, PartnerLoginFormFallback } from '@/components/partner/PartnerLoginForm';
import { AuthShell } from '@/components/creator/design/AuthShell';

export const metadata: Metadata = {
  title: 'Sign in — Snack Quest Owners',
};

// Never statically prerendered — see app/creator/login/page.tsx for why.
export const dynamic = 'force-dynamic';

export default function PartnerLoginPage() {
  return (
    <AuthShell title="Owner Portal" description="Sign in to see your machines, revenue, and profit.">
      <Suspense fallback={<PartnerLoginFormFallback />}>
        <PartnerLoginForm />
      </Suspense>
    </AuthShell>
  );
}
