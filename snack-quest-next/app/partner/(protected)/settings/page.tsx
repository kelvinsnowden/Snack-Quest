import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Settings' };

/** § SETTINGS placeholder — the partner's own profile, read-only until account editing exists. */
export default async function PartnerSettingsPage() {
  const session = await requirePartnerSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4 pt-0">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Name</p>
            <p className="text-sm font-medium text-foreground">{session.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</p>
            <p className="text-sm font-medium text-foreground">{session.contactEmail ?? 'Not set'}</p>
          </div>
          <p className="text-sm text-muted-foreground">To update your details, contact your Snack Quest representative.</p>
        </CardContent>
      </Card>
    </div>
  );
}
