import { readJsonObject, requiredString, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { connectHttpControlledSubject } from '@/lib/vending/contract/httpControlledSubject';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import { integrationCertificationService, CertificationNotAllowedError } from '@/services/integrationCertificationService';

/**
 * Runs the automated certification harness against a manufacturer's
 * sandbox machine, driven through its sandbox control endpoints
 * (`lib/vending/contract/httpControlledSubject.ts`), and — with
 * `recordToModel` — records the results, including the harness-only
 * `contract_suite` check, on the model's certification checklist.
 * Sandbox only; the harness itself refuses production.
 */
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.certify', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    let subject;
    try {
      subject = await connectHttpControlledSubject(requiredString(body, 'controlUrl'), requiredString(body, 'controlToken'), { allowLocalHttp: !isProductionDeployment() && process.env.NODE_ENV !== 'production' });
    } catch (error) {
      return Response.json({ error: `Could not reach the machine's control endpoints: ${error instanceof Error ? error.message : String(error)}` }, { status: 400 });
    }
    try {
      const report = await integrationCertificationService.run(session.businessId, id, subject, { recordToModel: body.recordToModel === true, actor: session.uid });
      await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'run_certification_harness', entityType: 'machine', entityId: id, after: { runId: report.runId, verdict: report.verdict, recordedToModel: body.recordToModel === true }, machineId: id });
      return Response.json({ report });
    } catch (error) {
      if (error instanceof CertificationNotAllowedError) return Response.json({ error: error.message }, { status: 409 });
      throw error;
    }
  });
}
