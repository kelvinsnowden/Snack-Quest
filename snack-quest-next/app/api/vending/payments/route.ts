import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineTransactionService, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';

/**
 * Collects payment for a vend over M-Pesa (§ M-PESA ARCHITECTURE,
 * docs/VENDING_OS_BENCHMARK.md §E). Device-authenticated: a machine
 * may only initiate a payment as itself — `machineId` comes from the
 * authenticated bearer token, never from the request body, so nothing
 * here ever lets one machine's gateway start a charge attributed to
 * another. The customer's phone number is the one thing only the
 * machine (from its own keypad/screen — not built yet) can supply;
 * everything else about the transaction is derived server-side from
 * `slotId`.
 */
export async function POST(request: Request): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { slotId, phoneNumber } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotId !== 'string' || !slotId) {
    return Response.json({ error: 'slotId is required' }, { status: 400 });
  }
  if (typeof phoneNumber !== 'string' || !phoneNumber) {
    return Response.json({ error: 'phoneNumber is required' }, { status: 400 });
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeKenyanPhone(phoneNumber);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const result = await machineTransactionService.initiateMpesaPayment({
      businessId: auth.businessId,
      machineId: auth.machineId,
      slotId,
      phoneNumber: normalizedPhone,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SlotUnavailableForSaleError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'could not initiate payment' }, { status: 400 });
  }
}
