import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { CAMERA_STATUS_TRANSITIONS, type Camera, type CameraConnectionConfig, type CameraConnectionState, type CameraStatus } from '@/types';

const COLLECTION = 'cameras';

export class CameraNotFoundError extends Error {
  constructor(cameraId: string) {
    super(`Camera ${cameraId} not found`);
    this.name = 'CameraNotFoundError';
  }
}

export class IllegalCameraTransitionError extends Error {
  constructor(from: CameraStatus, to: CameraStatus) {
    super(`Cannot move a camera from "${from}" to "${to}"`);
    this.name = 'IllegalCameraTransitionError';
  }
}

export type CameraInput = Omit<Camera, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'> & { createdBy: string };

/**
 * `cameras` reads/writes (§ CAMERA TYPES). Auto-id, unlike
 * `MachineSlot`'s composite `{machineId}__{slotCode}` key — a machine
 * can carry several cameras with no natural per-camera key the way a
 * slot has its own `slotCode`, so "the dispense-area camera on
 * machine M001" is a query (`listByMachine`, filtered by the staff's
 * own chosen `label` in the UI), not a doc-id lookup.
 */
class CameraRepository {
  async create(input: CameraInput): Promise<string> {
    const ref = adminFirestore.collection(COLLECTION).doc();
    await ref.set({ ...input, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.createdBy, deletedAt: null });
    return ref.id;
  }

  async findById(businessId: string, cameraId: string): Promise<Camera | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(cameraId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Camera;
    return data.businessId === businessId ? data : null;
  }

  async listByMachine(businessId: string, machineId: string): Promise<{ id: string; data: Camera }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('machineId', '==', machineId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Camera }));
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Camera }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Camera }));
  }

  /**
   * The one status-changing write, guarded the same way
   * `machineService.updateStatus` already guards `Machine.status`:
   * checked against `CAMERA_STATUS_TRANSITIONS` before the write,
   * never left to the caller to have gotten right.
   */
  async moveStatus(businessId: string, cameraId: string, to: CameraStatus, extra: Partial<Camera> = {}, actor = 'system'): Promise<void> {
    const camera = await this.findById(businessId, cameraId);
    if (!camera) {
      throw new CameraNotFoundError(cameraId);
    }
    if (!CAMERA_STATUS_TRANSITIONS[camera.status].includes(to)) {
      throw new IllegalCameraTransitionError(camera.status, to);
    }
    await adminFirestore
      .collection(COLLECTION)
      .doc(cameraId)
      .update({ ...extra, status: to, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  async updateConnection(businessId: string, cameraId: string, connection: CameraConnectionConfig, actor: string): Promise<void> {
    const camera = await this.findById(businessId, cameraId);
    if (!camera) {
      throw new CameraNotFoundError(cameraId);
    }
    await adminFirestore.collection(COLLECTION).doc(cameraId).update({ connection, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  async recordConnectionState(cameraId: string, connectionState: CameraConnectionState, extra: Partial<Camera> = {}): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(cameraId)
      .update({ ...extra, connectionState, updatedAt: FieldValue.serverTimestamp() });
  }

  async recordHealthCheck(cameraId: string, ok: boolean, errorMessage: string | null): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(cameraId)
      .update({
        lastHealthCheckAt: FieldValue.serverTimestamp(),
        lastHealthOk: ok,
        lastErrorMessage: errorMessage,
        ...(ok ? { lastSeenAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  async recordSnapshotAttempt(cameraId: string, success: boolean): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(cameraId)
      .update({
        ...(success ? { lastSnapshotAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
}

export const cameraRepository = new CameraRepository();
