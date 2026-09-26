import type { Timestamp } from 'firebase/firestore';

/**
 * `cameraSnapshots/{snapshotId}` — one still-image capture attempt
 * (§ SNAPSHOT MODEL). Recorded whether the capture succeeded or
 * failed — a failed attempt is still a real fact worth keeping (the
 * same "record the count even when nothing was wrong" discipline
 * `machineInventoryMovementService.recordDiscrepancyAdjustment`
 * already applies to a physical count that matched).
 *
 * **Never a dispense verdict.** `transactionId`, when set, only
 * associates this snapshot with a vend for later human review — see
 * `docs` note in `services/cameraService.ts` and
 * `services/machineTransactionService.ts`, which this type is never
 * imported by and never writes to. A snapshot is evidence, not a
 * `DispenseResultStatus`.
 */
export type CameraSnapshotReason = 'dispense_evidence' | 'machine_diagnostic' | 'fault_evidence' | 'admin_test' | 'manual_capture';

export interface CameraSnapshot {
  businessId: string;
  cameraId: string;
  machineId: string;
  /** Set only for `reason: 'dispense_evidence'` captures tied to a real vend — null for every other reason. Purely informational; see this type's own doc comment. */
  transactionId: string | null;
  reason: CameraSnapshotReason;
  capturedAt: Timestamp;
  success: boolean;
  /**
   * Where the captured bytes live — never the bytes themselves
   * (§ SNAPSHOT MODEL: "Do not store arbitrary image blobs directly
   * inside Firestore documents"). Null when `success` is false, or
   * when storage itself was not configured — see
   * `lib/vending/camera/snapshotStorage.ts`.
   */
  storageRef: string | null;
  errorMessage: string | null;
  /** Free-form, non-secret facts about the capture (e.g. resolution, adapter name) — never raw image data or connection credentials. */
  metadata: Record<string, string | number | boolean | null>;
  /** The staff uid that requested this capture, or `'system'` for a future automated caller — mirrors `AuditFields.createdBy`'s own convention, kept as its own field since `CameraSnapshot` has no other audit fields. */
  capturedBy: string;
}
