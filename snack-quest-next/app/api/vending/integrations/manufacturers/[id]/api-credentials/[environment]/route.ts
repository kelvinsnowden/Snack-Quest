import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { optionalString, readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import type { MachineIntegrationEnvironment } from '@/types';

/**
 * Sets the base URL and, optionally, a new API key — a new key on a
 * configured credential is a rotation (the old one is kept for roll-back).
 * Write-only: the key goes in, only its fingerprint ever comes out. The
 * audit log records the fingerprints, never the key.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; environment: string }> }): Promise<Response> {
  const { id, environment } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const before = (await manufacturerApiCredentialService.listSummaries(session.businessId, id)).find((c) => c.environment === environment) ?? null;
    const saved = await manufacturerApiCredentialService.set(
      session.businessId,
      id,
      environment as MachineIntegrationEnvironment,
      { baseUrl: requiredString(body, 'baseUrl'), apiKey: optionalString(body, 'apiKey') },
      session.uid,
    );
    const rotated = Boolean(before?.current && saved.current && before.current.version !== saved.current.version);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: rotated ? 'rotate_manufacturer_api_credential' : 'set_manufacturer_api_credential',
      entityType: 'manufacturerApiCredential',
      entityId: `${id}__${environment}`,
      before: before ? { baseUrl: before.baseUrl, version: before.current?.version ?? null, fingerprint: before.current?.fingerprint ?? null, status: before.status } : null,
      after: { baseUrl: saved.baseUrl, version: saved.current?.version ?? null, fingerprint: saved.current?.fingerprint ?? null, status: saved.status },
    });
    return Response.json({ credential: saved }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
