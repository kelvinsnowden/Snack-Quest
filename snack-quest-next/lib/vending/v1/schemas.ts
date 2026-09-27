import { z } from 'zod';

/**
 * Request bodies of the Snack Quest Machine API v1 — the contract as
 * code. docs/SNACK_QUEST_MACHINE_API_V1.md and
 * docs/openapi/machine-api-v1.yaml describe these same shapes; the
 * tests in tests/lib/machineApiV1Schemas.test.ts pin them.
 *
 * Objects are deliberately *not* strict: unknown fields are ignored.
 * That is what makes adding an optional field a non-breaking change —
 * a manufacturer on a newer client can send it to a server that
 * doesn't know it yet, and nothing fails.
 */

/** A caller-chosen id, unique per machine for one occurrence — the idempotency key for that report. */
const eventId = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/, 'must be 1–128 characters of [A-Za-z0-9_.:-]');
/** ISO-8601 with offset, by the machine's clock. Believed only when plausible (docs §7). */
const occurredAt = z.string().max(40).optional().nullable();
/** The manufacturer's own slot name — translated to Snack Quest's slot code by the configured slot mapping. */
const slotId = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'must be 1–64 characters of [A-Za-z0-9_.:-]');
const shortText = z.string().max(500);

export const connectSchema = z.object({
  manufacturerMachineId: z.string().min(1).max(128),
  serialNumber: z.string().max(128).optional().nullable(),
  firmwareVersion: z.string().max(64).optional().nullable(),
  controllerType: z.string().max(64).optional().nullable(),
  controllerVersion: z.string().max(64).optional().nullable(),
  integrationVersion: z.string().max(32).optional().nullable(),
});

export const heartbeatSchema = z.object({
  eventId,
  occurredAt,
  uptimeSeconds: z.number().int().nonnegative().optional(),
});

export const statusSchema = z.object({
  eventId,
  occurredAt,
  online: z.boolean(),
  doorOpen: z.boolean().optional().nullable(),
  temperatureCelsius: z.number().min(-50).max(100).optional().nullable(),
  faults: z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/)).max(50).optional(),
  paymentDeviceOk: z.boolean().optional().nullable(),
});

export const inventorySchema = z.object({
  reportId: eventId,
  occurredAt,
  slots: z
    .array(z.object({ slotId, quantity: z.number().int().min(0).max(10_000) }))
    .min(1)
    .max(500),
});

/** Money-moving outcomes are never accepted as generic events — they have their own endpoint with its own rules. */
export const DISPENSE_EVENT_TYPES = ['DISPENSE_REQUESTED', 'DISPENSE_STARTED', 'DISPENSE_SUCCESS', 'DISPENSE_FAILED'];

export const eventsSchema = z.object({
  events: z
    .array(
      z.object({
        eventId,
        type: z.string().min(1).max(64),
        occurredAt,
        slotId: slotId.optional().nullable(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const DISPENSE_FAILURE_CODES = ['failed', 'timeout', 'jam', 'no_product', 'sensor_failure', 'machine_offline'] as const;

export const commandStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('dispensing'), eventId, occurredAt }),
  z.object({ status: z.literal('dispensed'), eventId, occurredAt }),
  z.object({ status: z.literal('failed'), eventId, occurredAt, failureCode: z.enum(DISPENSE_FAILURE_CODES).default('failed'), failureReason: shortText.optional().nullable() }),
  z.object({ status: z.literal('unknown'), eventId, occurredAt, failureReason: shortText.optional().nullable() }),
  z.object({ status: z.literal('completed'), eventId, occurredAt }),
]);

export type CommandStatusBody = z.infer<typeof commandStatusSchema>;
