import { randomUUID } from 'node:crypto';
import {
  ProtocolNotConfiguredError,
  type VendAuthorizationResult,
  type VendResultReport,
  type VendingHardwareAdapter,
  type VendingMachineStatusReport,
  type VendingSlotReport,
  type VendingTelemetryReport,
} from '../hardwareAdapter';
import { NO_CAPABILITIES, type HardwareCapabilities } from '../protocol/capabilities';

/**
 * `ShengmaAdapter` — an interface-conformant stub for `manufacturer:
 * 'shengma'` (§ E of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md).
 *
 * Shengma will not provide their proprietary API/SDK documentation, but
 * their control boards publicly advertise MDB 4.2 and DEX/EVA-DTS
 * support. This adapter is the honest slot that fact leaves open: it
 * implements the real `VendingHardwareAdapter` interface so the
 * business layer, the admin UI, and Firestore never need to know a
 * Shengma machine exists as a special case — but it wires no protocol
 * behind any method, because doing that without a spec or a real
 * machine to test against would mean inventing behaviour.
 *
 * Once Shengma confirms which protocol (MDB, DEX, or an internal API
 * they *can* document) a given deployment actually uses, whoever wires
 * it constructs this adapter's replacement — or extends this one — with
 * a real `MdbTransport`/`DexTransport` behind it. Nothing above this
 * class changes when that happens; that is the entire point of the
 * abstraction already in place.
 *
 * `capabilities()` never throws — discoverability is unconditional.
 * `authorizeVend` returns a normal refusal, not an exception, because
 * `MachineTransactionService.authorizeVend` already knows exactly what
 * to do with `{ authorized: false }`: move the transaction to
 * `paid_vend_failed` and let the refund path handle it, the same as a
 * real machine reporting "slot empty". Every other method throws
 * `ProtocolNotConfiguredError` — there is no natural "nothing happened"
 * value for them to return instead, and nothing today calls them
 * without a human already looking at the result (the admin diagnostics
 * panel, which renders the error message directly).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every parameter below exists only to satisfy VendingHardwareAdapter's signature; the method throws or refuses before ever reading it. */
export class ShengmaAdapter implements VendingHardwareAdapter {
  readonly manufacturer = 'shengma';

  capabilities(): HardwareCapabilities {
    return NO_CAPABILITIES;
  }

  async getMachineStatus(_machineId: string): Promise<VendingMachineStatusReport> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'getMachineStatus');
  }

  async getSlots(_machineId: string): Promise<VendingSlotReport[]> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'getSlots');
  }

  async getInventory(_machineId: string, _slotCode: string): Promise<{ quantity: number | null }> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'getInventory');
  }

  async setPrice(_machineId: string, _slotCode: string, _priceKes: number): Promise<void> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'setPrice');
  }

  async enableSlot(_machineId: string, _slotCode: string): Promise<void> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'enableSlot');
  }

  async disableSlot(_machineId: string, _slotCode: string): Promise<void> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'disableSlot');
  }

  async authorizeVend(_machineId: string, _slotCode: string): Promise<VendAuthorizationResult> {
    return {
      vendRef: `shengma-unconfigured-${randomUUID()}`,
      authorized: false,
      reason: 'protocol not configured — no MDB/DEX transport is wired for this machine yet',
    };
  }

  receiveVendResult(_rawPayload: unknown): VendResultReport {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'receiveVendResult');
  }

  receiveTelemetry(_rawPayload: unknown): VendingTelemetryReport {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'receiveTelemetry');
  }

  async getTemperature(_machineId: string): Promise<number | null> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'getTemperature');
  }

  async getFaults(_machineId: string): Promise<string[]> {
    throw new ProtocolNotConfiguredError(this.manufacturer, 'getFaults');
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
