import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { manufacturerOnboardingService } from '@/services/manufacturerOnboardingService';
import { OnboardingChecklist } from '@/components/admin/integrations/OnboardingChecklist';
import { CertificationRuns } from '@/components/admin/integrations/CertificationRuns';
import { findAdapterRegistration } from '@/lib/vending/adapterRegistry';
import { HARDWARE_CAPABILITY_LABELS, type HardwareCapability } from '@/lib/vending/protocol/capabilities';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ManufacturerStageControls } from '@/components/admin/integrations/ManufacturerStageControls';
import { CreateModelForm } from '@/components/admin/integrations/CreateModelForm';
import { CertificationPanel, type ChecklistEntry } from '@/components/admin/integrations/CertificationPanel';
import { CredentialsPanel, type CredentialRow } from '@/components/admin/integrations/CredentialsPanel';
import { ManufacturerApiCredentialsPanel, type ApiCredentialRow } from '@/components/admin/integrations/ManufacturerApiCredentialsPanel';
import { CredentialHistory, type CredentialHistoryEntry } from '@/components/admin/integrations/CredentialHistory';
import { CertificationBadge, IntegrationHealthBadge, IntegrationStateBadge } from '@/components/admin/integrations/IntegrationBadges';
import type { CertificationCheckKey } from '@/types';

export const metadata: Metadata = { title: 'Manufacturer' };

/** One manufacturer's whole relationship: onboarding, models and their certification, credentials, and the machines connected through it. */
export default async function ManufacturerPage({ params }: { params: Promise<{ manufacturerId: string }> }) {
  const { manufacturerId } = await params;
  const session = await requireStaffSession();
  const manufacturer = await manufacturerRepository.findById(session.businessId, manufacturerId);
  if (!manufacturer) {
    notFound();
  }
  const [models, credentials, apiCredentials, integrations] = await Promise.all([
    manufacturerRegistryService.listModels(session.businessId, manufacturerId),
    integrationCredentialService.listForManufacturer(session.businessId, manufacturerId),
    manufacturerApiCredentialService.listSummaries(session.businessId, manufacturerId),
    machineIntegrationService.listIntegrations(session.businessId),
  ]);
  const [onboardingSteps, certificationRuns] = await Promise.all([
    manufacturerOnboardingService.checklist(session.businessId, manufacturerId),
    manufacturerOnboardingService.certificationRuns(session.businessId, manufacturerId),
  ]);
  const credentialHistory = await auditLogRepository.listForEntities(
    session.businessId,
    [...credentials.map((credential) => credential.keyId), `${manufacturerId}__sandbox`, `${manufacturerId}__production`],
    30,
  );
  const adapter = findAdapterRegistration(manufacturer.defaultAdapterKey);
  const machines = integrations.filter(({ integration }) => integration.manufacturerId === manufacturerId);
  const modelName = new Map(models.map(({ id, data }) => [id, data.name]));
  const webhookUrl = `/api/v1/webhooks/manufacturers/${manufacturer.slug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/vending/integrations" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Machine Integrations
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{manufacturer.name}</h1>
          {manufacturer.status === 'suspended' ? <Badge variant="warning">Suspended</Badge> : null}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div><dt className="inline">Adapter: </dt><dd className="inline text-foreground">{adapter?.label ?? manufacturer.defaultAdapterKey}</dd></div>
          {manufacturer.apiVersion ? <div><dt className="inline">Contract version: </dt><dd className="inline text-foreground">{manufacturer.apiVersion}</dd></div> : null}
          {manufacturer.supportContact ? <div><dt className="inline">Contact: </dt><dd className="inline text-foreground">{manufacturer.supportContact}</dd></div> : null}
          {manufacturer.documentationUrl ? (
            <div><dt className="inline">Docs: </dt><dd className="inline"><a href={manufacturer.documentationUrl} className="text-primary hover:underline" rel="noreferrer noopener" target="_blank">their documentation</a></dd></div>
          ) : null}
          <div><dt className="inline">Webhook URL: </dt><dd className="inline"><code className="font-mono text-xs text-foreground">{webhookUrl}</code></dd></div>
        </dl>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
        </CardHeader>
        <CardContent>
          <ManufacturerStageControls manufacturerId={manufacturerId} stage={manufacturer.onboardingStage} status={manufacturer.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <OnboardingChecklist steps={onboardingSteps} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {models.length === 0 ? <p className="text-sm text-muted-foreground">No models yet.</p> : null}
          {models.map(({ id, data }) => (
            <section key={id} className="flex flex-col gap-4 border-b border-border pb-8 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold">{data.name}</h3>
                <CertificationBadge status={data.certificationStatus} />
                {data.slotCount ? <span className="text-sm text-muted-foreground">{data.slotCount} slots{data.slotIdFormat ? ` · ${data.slotIdFormat}` : ''}</span> : null}
              </div>
              {data.revokedReason && data.certificationStatus !== 'certified' ? <p className="text-sm text-warning">{data.revokedReason}</p> : null}
              <div className="flex flex-wrap gap-1.5">
                {data.declaredCapabilities.map((capability) => (
                  <Badge key={capability} variant="outline">{HARDWARE_CAPABILITY_LABELS[capability as HardwareCapability] ?? capability}</Badge>
                ))}
              </div>
              <CertificationPanel
                modelId={id}
                status={data.certificationStatus}
                checklist={toJsonSafe(data.certificationChecklist) as Partial<Record<CertificationCheckKey, ChecklistEntry>>}
              />
            </section>
          ))}
          <div className="rounded-md border border-dashed border-border p-4">
            <h3 className="mb-4 text-sm font-medium">Add a model</h3>
            <CreateModelForm manufacturerId={manufacturerId} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certification harness runs</CardTitle>
        </CardHeader>
        <CardContent>
          <CertificationRuns runs={certificationRuns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <CredentialsPanel
            manufacturerId={manufacturerId}
            credentials={toJsonSafe(credentials) as CredentialRow[]}
            canIssueProduction={manufacturer.onboardingStage === 'production'}
            machines={machines.map(({ integration }) => ({ machineId: integration.machineId, machineCode: integration.machineCode, environment: integration.environment }))}
          />
        </CardContent>
      </Card>

      {adapter?.direction !== 'inbound' ? (
        <Card>
          <CardHeader>
            <CardTitle>API key for calling {manufacturer.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ManufacturerApiCredentialsPanel manufacturerId={manufacturerId} credentials={apiCredentials as ApiCredentialRow[]} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Credential history</CardTitle>
        </CardHeader>
        <CardContent>
          <CredentialHistory
            entries={credentialHistory.map(({ id, data }) => ({
              id,
              action: data.action,
              entityId: data.entityId,
              actorId: data.actorId,
              at: data.createdAt ? data.createdAt.toDate().toISOString() : null,
              after: (data.after as Record<string, unknown> | null) ?? null,
            })) as CredentialHistoryEntry[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected machines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {machines.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No machines connected through this manufacturer yet. Configure one from its machine page.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Their id</th>
                    <th className="px-6 py-3 font-medium">Model</th>
                    <th className="px-6 py-3 font-medium">State</th>
                    <th className="px-6 py-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map(({ integration, health }) => (
                    <tr key={integration.machineId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3"><Link href={`/admin/vending/${integration.machineId}`} className="font-medium text-primary hover:underline">{integration.machineCode}</Link></td>
                      <td className="px-6 py-3"><code className="font-mono text-xs">{integration.manufacturerMachineId}</code></td>
                      <td className="px-6 py-3">{modelName.get(integration.modelId) ?? '—'}</td>
                      <td className="px-6 py-3"><IntegrationStateBadge state={integration.state} /></td>
                      <td className="px-6 py-3" title={health.reason}><IntegrationHealthBadge state={health.state} /></td>
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
