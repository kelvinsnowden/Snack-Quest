import { optionalString, readJsonObject, requiredString, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { RegistryValidationError } from '@/services/manufacturerRegistryService';
import type { IntegrationCredentialKind, MachineIntegrationEnvironment } from '@/types';

/**
 * Issues a signing credential. The secret is in this response and
 * nowhere else, ever — it is stored encrypted and no route returns it
 * again. The audit log records that a key was issued, never the key.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.credentials.manage', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const expiresAtRaw = optionalString(body, 'expiresAt');
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new RegistryValidationError('expiresAt must be an ISO date');
    }
    const issued = await integrationCredentialService.issue(
      session.businessId,
      id,
      {
        kind: requiredString(body, 'kind') as IntegrationCredentialKind,
        environment: requiredString(body, 'environment') as MachineIntegrationEnvironment,
        label: optionalString(body, 'label') ?? '',
        expiresAt,
        machineId: optionalString(body, 'machineId'),
        rateLimitPerMinute: typeof body.rateLimitPerMinute === 'number' ? body.rateLimitPerMinute : null,
      },
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'issue_integration_credential',
      entityType: 'integrationCredential',
      entityId: issued.keyId,
      after: { manufacturerId: id, kind: issued.kind, environment: issued.environment, scope: issued.scope, secretFingerprint: issued.secretFingerprint },
    });
    return Response.json({ credential: issued }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}
