import { withPermission } from '@/lib/vending/adminIntegrationRoute';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';

/**
 * Snack Quest's credentials for calling this manufacturer's API, per
 * environment. Summaries only — base URL, version, fingerprint, who and
 * when. No route ever returns the key.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.credentials.manage', async (session) => {
    const credentials = await manufacturerApiCredentialService.listSummaries(session.businessId, id);
    return Response.json({ credentials }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
