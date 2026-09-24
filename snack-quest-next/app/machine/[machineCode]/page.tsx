import { notFound } from 'next/navigation';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineRepository } from '@/repositories/machineRepository';
import { KioskScreen } from '@/components/kiosk/KioskScreen';

/**
 * The customer machine screen (§ PART 1 — CUSTOMER MACHINE EXPERIENCE,
 * § CUSTOMER SCREEN). Public, unauthenticated route — this is the
 * touchscreen software running on the physical machine itself, not a
 * page a customer would ever type a URL into on their own phone.
 *
 * `machineCode` (the human-facing id, e.g. "SQ-001") resolves to the
 * internal `machineId` server-side, in a Server Component, so the
 * page never needs a public "look up a machine by code" API route —
 * the one thing this route reveals to an unauthenticated request is
 * "a machine with this code exists" (or doesn't), nothing about its
 * secret, its owner, or its financials. Everything else — the actual
 * catalog, pricing, and payment/vend flow — goes through the exact
 * same device-authenticated routes a real gateway already uses
 * (`GET .../catalog`, `POST/GET .../payments`), with the device
 * secret supplied once at pairing time and kept only in this
 * browser's own `localStorage` (§ KIOSK PAIRING in `KioskScreen`) —
 * never in this page, never server-side beyond what already exists.
 */
export default async function MachineScreenPage({
  params,
}: {
  params: Promise<{ machineCode: string }>;
}) {
  const { machineCode } = await params;
  const businessId = getCurrentBusinessId();
  const machine = await machineRepository.findByMachineCode(businessId, machineCode);
  if (!machine) {
    notFound();
  }

  return <KioskScreen machineId={machine.id} machineCode={machineCode} />;
}
