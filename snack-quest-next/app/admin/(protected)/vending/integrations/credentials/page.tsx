import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import { userRepository } from '@/repositories/userRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Integration keys' };

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_MS = 14 * DAY_MS;

/** Expires within two weeks — highlighted so a rotation can be planned. */
function soon(expiresAt: { toMillis(): number } | null, now = Date.now()): boolean {
  return expiresAt !== null && expiresAt.toMillis() - now < EXPIRING_SOON_MS;
}

/**
 * Every manufacturer key in one place (`integrations.credentials.manage`,
 * super admin by default): the keys manufacturers sign requests to us
 * with, and our keys for calling their APIs. Shows who issued each, when
 * it expires and when it was last used; never a secret, only its
 * fingerprint. Issuing, rotating and revoking stay on each
 * manufacturer's page.
 */
export default async function IntegrationKeysPage() {
  const session = await requireAdminPage('vending', 'integrations.credentials.manage');
  const manufacturers = await manufacturerRepository.listByBusiness(session.businessId);
  const perManufacturer = await Promise.all(
    manufacturers.map(async ({ id, data }) => ({
      id,
      name: data.name,
      inbound: await integrationCredentialService.listForManufacturer(session.businessId, id),
      outbound: await manufacturerApiCredentialService.listSummaries(session.businessId, id),
    })),
  );
  const inbound = perManufacturer.flatMap(({ id, name, inbound: keys }) => keys.map((key) => ({ manufacturerId: id, manufacturerName: name, key })));
  const outbound = perManufacturer.flatMap(({ id, name, outbound: keys }) => keys.map((key) => ({ manufacturerId: id, manufacturerName: name, key })));
  const issuerIds = Array.from(new Set([...inbound.map(({ key }) => key.issuedBy), ...outbound.map(({ key }) => key.current?.setBy).filter((id): id is string => Boolean(id))]));
  const issuers = new Map((await Promise.all(issuerIds.map(async (id) => [id, (await userRepository.findById(id))?.displayName ?? id] as const))).map(([id, name]) => [id, name]));
  inbound.sort((a, b) => Number(b.key.status === 'active') - Number(a.key.status === 'active') || (a.key.expiresAt?.toMillis() ?? Infinity) - (b.key.expiresAt?.toMillis() ?? Infinity));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/admin/vending/integrations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Machine Integrations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Integration keys</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Every key a manufacturer uses to reach us, and every key we use to reach them. Secrets are never shown; issue, rotate or revoke on the manufacturer’s page.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keys manufacturers sign with ({inbound.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {inbound.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No keys issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Manufacturer</th>
                    <th className="px-6 py-3 font-medium">Key</th>
                    <th className="px-6 py-3 font-medium">Where</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Issued by</th>
                    <th className="px-6 py-3 font-medium">Expires</th>
                    <th className="px-6 py-3 font-medium">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {inbound.map(({ manufacturerId, manufacturerName, key }) => (
                    <tr key={key.keyId} className="border-b border-border last:border-0 align-top">
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/integrations/${manufacturerId}`} className="text-primary hover:underline">
                          {manufacturerName}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-foreground">{key.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {key.keyId} · {key.secretHint}
                        </p>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{key.environment}</td>
                      <td className="px-6 py-3">
                        <Badge variant={key.status === 'active' ? 'success' : 'outline'}>{key.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {issuers.get(key.issuedBy) ?? key.issuedBy}
                        <br />
                        <span className="text-xs">{key.issuedAt ? formatDateTime(key.issuedAt) : '—'}</span>
                      </td>
                      <td className={`px-6 py-3 ${key.status === 'active' && soon(key.expiresAt) ? 'font-medium text-warning' : 'text-muted-foreground'}`}>{key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never used'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Our keys for their APIs ({outbound.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {outbound.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No manufacturer API keys set.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Manufacturer</th>
                    <th className="px-6 py-3 font-medium">Where</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Current key</th>
                    <th className="px-6 py-3 font-medium">Set by</th>
                  </tr>
                </thead>
                <tbody>
                  {outbound.map(({ manufacturerId, manufacturerName, key }) => (
                    <tr key={`${manufacturerId}:${key.environment}`} className="border-b border-border last:border-0 align-top">
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/integrations/${manufacturerId}`} className="text-primary hover:underline">
                          {manufacturerName}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{key.environment}</td>
                      <td className="px-6 py-3">
                        <Badge variant={key.status === 'active' ? 'success' : 'outline'}>{key.status}</Badge>
                        {key.revokedReason ? <p className="mt-1 text-xs text-muted-foreground">{key.revokedReason}</p> : null}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{key.current ? `v${key.current.version} · ${key.current.fingerprint}` : '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {key.current ? (
                          <>
                            {issuers.get(key.current.setBy) ?? key.current.setBy}
                            <br />
                            <span className="text-xs">{new Date(key.current.setAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
