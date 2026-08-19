import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, Lock, LockOpen } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { integrationSettingsService } from '@/services/integrationSettingsService';
import { IntegrationCard } from '@/components/admin/IntegrationCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Integrations' };

/**
 * Which env vars back each platform-wide (not per-tenant) integration
 * — shown status-only, never editable here: unlike Daraja/Whatchimp/
 * Jumia/Meta, these are one credential per deployment (see
 * `.env.local.example`'s own note on why), so an edit here would do
 * nothing without a redeploy. Google Maps/AI/Analytics have no Gateway
 * implementation at all yet (§ production readiness audit) — shown so
 * the portal is a complete, honest picture of every integration this
 * platform mentions, not just the ones that happen to be built.
 */
const PLATFORM_WIDE_INTEGRATIONS: Array<{ label: string; configured: boolean; note: string }> = [
  {
    label: 'Firebase (Auth + Firestore)',
    configured: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
    note: 'The database this app itself runs on — set via deployment environment variables, never editable at runtime.',
  },
  {
    label: 'Fallback email (SendGrid)',
    configured: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
    note: 'Only used by a business that has not connected its own SMTP above. One account per deployment, changed via deployment environment variables — configure Email (SMTP) instead and everything sends from your own domain.',
  },
  {
    label: 'SMS (Africa’s Talking)',
    configured: Boolean(process.env.AFRICAS_TALKING_API_KEY && process.env.AFRICAS_TALKING_USERNAME),
    note: 'One SMS account per deployment, not per business. Change via deployment environment variables.',
  },
];

const NOT_YET_INTEGRATED = ['Google Maps', 'AI provider', 'Third-party analytics'];

export default async function AdminIntegrationsPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
          <p className="text-sm text-muted-foreground">
            Integration credentials are the most sensitive settings in this platform — only a super admin can view or change them.
          </p>
        </Card>
      </div>
    );
  }

  const integrations = await integrationSettingsService.listSummaries(session.businessId);
  const encryptionConfigured = integrationSettingsService.encryptionConfigured();

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage every external service this business connects to — credentials are stored per business and take effect immediately, no redeploy needed.
        </p>
      </div>

      <Card className={`flex items-start gap-3 p-4 ${encryptionConfigured ? '' : 'border-warning/50 bg-warning/5'}`}>
        {encryptionConfigured ? (
          <Lock className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <LockOpen className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">
            {encryptionConfigured ? 'Credential encryption at rest is on for this deployment.' : 'Credential encryption at rest is off for this deployment.'}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {encryptionConfigured
              ? 'New and re-saved integration credentials are encrypted (AES-256-GCM) before being stored. Any card below still marked "unencrypted" was saved before this was turned on — open Configure and save it again to encrypt it.'
              : 'Integration credentials below are stored as plain text in the database. Ask whoever manages this deployment to set the SECRET_ENCRYPTION_KEY environment variable (see .env.local.example) — every credential saved after that is encrypted automatically, no code changes needed.'}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.provider} integration={integration} />
        ))}
      </div>

      <div>
        <h2 className="text-section-title font-bold tracking-tight text-foreground">Platform-wide</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared across every business on this deployment, not editable per tenant here.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_WIDE_INTEGRATIONS.map((item) => (
            <Card key={item.label} className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-card-title font-semibold text-foreground">{item.label}</p>
                <Badge variant={item.configured ? 'success' : 'outline'}>{item.configured ? 'Configured' : 'Not configured'}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">{item.note}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-section-title font-bold tracking-tight text-foreground">Not yet integrated</h2>
        <p className="mt-1 text-sm text-muted-foreground">No Gateway exists for these yet — shown so this list stays honest about what this platform can actually do today.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {NOT_YET_INTEGRATED.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
