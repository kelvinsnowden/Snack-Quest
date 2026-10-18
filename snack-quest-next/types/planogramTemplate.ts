import type { Timestamp } from 'firebase/firestore';
import type { MachineSlot } from './machineSlot';

/**
 * `planogramTemplates/{templateId}` — a named slot layout (which product
 * in which slot, at what price and capacity) saved from a machine and
 * applied to others, e.g. one layout for every office machine.
 */
export interface PlanogramTemplate {
  businessId: string;
  name: string;
  /** What kind of place it suits, free text ("Office", "Gym"); only for finding it. */
  suitsFor: string | null;
  slots: Pick<MachineSlot, 'slotCode' | 'productId' | 'productCatalogue' | 'priceKes' | 'capacity' | 'position'>[];
  sourceMachineCode: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
