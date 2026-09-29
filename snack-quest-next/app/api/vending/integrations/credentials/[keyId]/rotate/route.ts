import { readJsonObject, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { integrationCredentialService } from '@/services/integrationCredentialService';

/**
 * Zero-downtime rotation: issues a successor (its secret is in this
 * response and nowhere else, ever) and keeps the old key working for
 * `graceHours` (default 7 days) so the manufacturer can roll the new
 * secret across its fleet. The old key's responses carry
 * `SQ-Credential-Status: rotating` until then.
 */
export async function POST(request: Request, { params }: { params: Promise<{ keyId: string }> }): Promise<Response> {
  const { keyId } = await params;
  return withPermission(request, 'integrations.credentials.manage', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const graceHours = typeof body.graceHours === 'number' ? body.graceHours : undefined;
    const issued = await integrationCredentialService.rotate(session.businessId, keyId, { graceHours }, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'rotate_integration_credential',
      entityType: 'integrationCredential',
      entityId: keyId,
      after: { successorKeyId: issued.keyId, previousKeyGraceEndsAt: issued.previousKeyGraceEndsAt },
    });
    return Response.json({ credential: issued }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}
