import { secretsMatch } from '@/lib/auth/cronAuth';
import { vendingLeadService, VendingLeadValidationError } from '@/services/vendingLeadService';

/**
 * `POST /api/leads/sheet` (§ vending leads CRM) — where the Apps Script
 * inside the Meta leads Google Sheet sends its rows
 * (`docs/leads-google-sheet-sync.gs`).
 *
 * Pushed from the sheet rather than pulled from it, so the sheet stays
 * private and no Google credentials live in this app. The only key is
 * a shared secret, `LEADS_SHEET_SECRET`, sent as
 * `Authorization: Bearer …`; with it unset, every request is refused.
 *
 * Body: `{ "rows": [ { "<column header>": "<value>", ... }, ... ] }`.
 * Idempotent per lead (see `VendingLeadRepository.upsertFromSource`),
 * so the script can resend the whole sheet safely.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.LEADS_SHEET_SECRET;
  const presented = request.headers.get('authorization');
  if (!expected || !presented || !secretsMatch(presented, `Bearer ${expected}`)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  try {
    const result = await vendingLeadService.ingestSheetRows((body as { rows?: unknown } | null)?.rows);
    return Response.json(result);
  } catch (error) {
    if (error instanceof VendingLeadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('[leads/sheet] ingest failed', error);
    return Response.json({ error: 'ingest failed' }, { status: 500 });
  }
}
