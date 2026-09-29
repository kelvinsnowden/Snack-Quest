import { optionalString, readJsonObject, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { probeManufacturerApi } from '@/lib/vending/contract/outboundProbe';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';

/**
 * Probes the manufacturer's API for this machine against the reference
 * contract, with the stored credential for its environment (never one
 * typed into the request). Read-only unless `includeVend` — which
 * creates one real vend, so it is refused on production integrations.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.certify', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const integration = await machineIntegrationRepository.findByMachineId(session.businessId, id);
    if (!integration) return Response.json({ error: 'This machine has no integration' }, { status: 404 });
    const includeVend = body.includeVend === true;
    if (includeVend && integration.environment !== 'sandbox') {
      return Response.json({ error: 'A probe that dispenses runs only against sandbox integrations' }, { status: 409 });
    }
    const credential = await manufacturerApiCredentialService.resolveForMachine(id);
    if (!credential) return Response.json({ error: `No ${integration.environment} API credential is configured for this manufacturer` }, { status: 409 });
    const report = await probeManufacturerApi({ baseUrl: credential.baseUrl, apiKey: credential.apiKey, manufacturerMachineId: integration.manufacturerMachineId, slotId: optionalString(body, 'slotId') ?? undefined, includeVend });
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'probe_manufacturer_api', entityType: 'machine', entityId: id, after: { verdict: report.verdict, includeVend }, machineId: id });
    return Response.json({ report });
  });
}
