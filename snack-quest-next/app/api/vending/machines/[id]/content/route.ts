import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { kioskContentService } from '@/services/kioskContentService';

/**
 * A machine's screen content package (§ CONTENT SYNC): its published
 * design and artwork. Device-authenticated exactly like `GET .../catalog`:
 * a machine reads only its own package, and any other id reads as not
 * found. `?have=<packageVersion>` returns `{ unchanged: true }` when
 * nothing changed, so a polling screen downloads the package only when
 * there is something new.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await params;
  if (id !== auth.machineId) return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  try {
    const content = await kioskContentService.packageFor(auth.businessId, auth.machineId);
    const have = new URL(request.url).searchParams.get('have');
    if (have && have === content.packageVersion) return Response.json({ unchanged: true, packageVersion: content.packageVersion });
    return Response.json(content);
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
