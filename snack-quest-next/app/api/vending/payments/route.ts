import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineTransactionService, SlotUnavailableForSaleError, EmptyCartError } from '@/services/machineTransactionService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';

/**
 * Collects payment for a vend over M-Pesa (§ M-PESA ARCHITECTURE,
 * docs/VENDING_OS_BENCHMARK.md §E; § PART 1 — one M-Pesa prompt per
 * cart, never one per item). Device-authenticated: a machine may only
 * initiate a payment as itself — `machineId` comes from the
 * authenticated bearer token, never from the request body, so nothing
 * here ever lets one machine's gateway start a charge attributed to
 * another. The customer's phone number is the one thing only the
 * machine (from its own keypad/screen) can supply; everything else
 * about each item is derived server-side from its own `slotId`.
 *
 * Two request shapes, both still accepted: `slotId` (a single item —
 * unchanged since before carts existed) or `slotIds` (a cart of one or
 * more). They return different response shapes because they call
 * different service methods, but a caller sending `slotIds: [x]`
 * exercises the exact same one-item-cart code path `slotId: x` does
 * (`initiateMpesaPayment` is `initiateCartPayment` for one item — see
 * that method's own doc comment) — there is no second implementation
 * to keep in sync.
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

  const { slotId, slotIds, phoneNumber } = (body ?? {}) as Record<string, unknown>;
  const isCart = slotIds !== undefined;
  if (isCart) {
    if (!Array.isArray(slotIds) || slotIds.length === 0 || !slotIds.every((s) => typeof s === 'string' && s)) {
      return Response.json({ error: 'slotIds must be a non-empty array of slot ids' }, { status: 400 });
    }
  } else if (typeof slotId !== 'string' || !slotId) {
    return Response.json({ error: 'slotId or slotIds is required' }, { status: 400 });
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
    if (isCart) {
      const result = await machineTransactionService.initiateCartPayment({
        businessId: auth.businessId,
        machineId: auth.machineId,
        slotIds: slotIds as string[],
        phoneNumber: normalizedPhone,
      });
      return Response.json(result, { status: 201 });
    }
    const result = await machineTransactionService.initiateMpesaPayment({
      businessId: auth.businessId,
      machineId: auth.machineId,
      slotId: slotId as string,
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
    if (error instanceof EmptyCartError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'could not initiate payment' }, { status: 400 });
  }
}
