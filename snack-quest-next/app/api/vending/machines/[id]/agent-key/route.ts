import { withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotIntegratedError, machineAgentKeyService } from '@/services/machineAgentKeyService';

/** `GET` — this machine's own API keys (never their secrets). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.credentials.manage', async (session) => Response.json({ keys: await machineAgentKeyService.list(session.businessId, id) }));
}

/**
 * `POST` — issues a key that speaks for this machine only, for the
 * Machine Agent on it, with a ready-to-paste config. The secret is in
 * this response and nowhere else; the audit log records the key, never it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.credentials.manage', async (session) => {
    try {
      const issued = await machineAgentKeyService.issue(session.businessId, id, session.uid);
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'issue_integration_credential',
        entityType: 'integrationCredential',
        entityId: issued.keyId,
        machineId: id,
        after: { scope: 'machine', environment: issued.environment, secretFingerprint: issued.secretFingerprint },
      });
      return Response.json(issued, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof MachineNotIntegratedError) return Response.json({ error: error.message }, { status: 409 });
      throw error;
    }
  });
}
