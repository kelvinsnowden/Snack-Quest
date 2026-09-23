import type {
  Machine,
  MachineCommand,
  MachineConnectivityStatus,
  MachineDailySummary,
  MachineSlot,
  MachineTransaction,
  PartnerDailySummary,
  RestockTask,
} from '@/types';

/**
 * Client-safe shapes for the vending API responses. Firestore
 * `Timestamp` fields are class instances the RSC boundary and plain
 * `JSON.stringify` both mishandle — same conversion `lib/recipes/serialize.ts`
 * already does for the recipe/shopping surfaces, applied to the
 * fleet's own types.
 */

export interface SerializedMachine {
  id: string;
  machineCode: string;
  serialNumber: string;
  manufacturer: Machine['manufacturer'];
  model: string;
  hardwareVersion: string | null;
  firmwareVersion: string | null;
  status: Machine['status'];
  connectivityStatus: MachineConnectivityStatus;
  ownerPartnerId: string | null;
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  venueName: string | null;
  installedAt: string | null;
  lastSeenAt: string | null;
}

export function serializeMachine(id: string, data: Machine, connectivityStatus: MachineConnectivityStatus): SerializedMachine {
  return {
    id,
    machineCode: data.machineCode,
    serialNumber: data.serialNumber,
    manufacturer: data.manufacturer,
    model: data.model,
    hardwareVersion: data.hardwareVersion,
    firmwareVersion: data.firmwareVersion,
    status: data.status,
    connectivityStatus,
    ownerPartnerId: data.ownerPartnerId,
    locationId: data.locationId,
    latitude: data.latitude,
    longitude: data.longitude,
    address: data.address,
    venueName: data.venueName,
    installedAt: data.installedAt ? data.installedAt.toDate().toISOString() : null,
    lastSeenAt: data.lastSeenAt ? data.lastSeenAt.toDate().toISOString() : null,
  };
}

export type SerializedMachineSlot = MachineSlot;

export function serializeMachineSlot(data: MachineSlot): SerializedMachineSlot {
  return data;
}

export interface SerializedMachineTransaction {
  id: string;
  machineId: string;
  slotId: string;
  productId: string;
  productCatalogue: MachineTransaction['productCatalogue'];
  transactionRef: string;
  paymentRef: string | null;
  vendRef: string | null;
  amountKes: number;
  currency: 'KES';
  paymentMethod: MachineTransaction['paymentMethod'];
  status: MachineTransaction['status'];
  paidAt: string | null;
  dispensedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export function serializeMachineTransaction(id: string, data: MachineTransaction): SerializedMachineTransaction {
  return {
    id,
    machineId: data.machineId,
    slotId: data.slotId,
    productId: data.productId,
    productCatalogue: data.productCatalogue,
    transactionRef: data.transactionRef,
    paymentRef: data.paymentRef,
    vendRef: data.vendRef,
    amountKes: data.amountKes,
    currency: data.currency,
    paymentMethod: data.paymentMethod,
    status: data.status,
    paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
    dispensedAt: data.dispensedAt ? data.dispensedAt.toDate().toISOString() : null,
    failureReason: data.failureReason,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}

export interface SerializedMachineCommand {
  id: string;
  machineId: string;
  commandRef: string;
  commandType: MachineCommand['commandType'];
  payload: MachineCommand['payload'];
  status: MachineCommand['status'];
  requestedBy: string;
  expiresAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

export function serializeMachineCommand(id: string, data: MachineCommand): SerializedMachineCommand {
  return {
    id,
    machineId: data.machineId,
    commandRef: data.commandRef,
    commandType: data.commandType,
    payload: data.payload,
    status: data.status,
    requestedBy: data.requestedBy,
    expiresAt: data.expiresAt.toDate().toISOString(),
    acknowledgedAt: data.acknowledgedAt ? data.acknowledgedAt.toDate().toISOString() : null,
    completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null,
    error: data.error,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}

export interface SerializedRestockTask {
  id: string;
  machineId: string;
  items: RestockTask['items'];
  status: RestockTask['status'];
  priority: RestockTask['priority'];
  assignedTo: string | null;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function serializeRestockTask(id: string, data: RestockTask): SerializedRestockTask {
  return {
    id,
    machineId: data.machineId,
    items: data.items,
    status: data.status,
    priority: data.priority,
    assignedTo: data.assignedTo,
    note: data.note,
    createdAt: data.createdAt.toDate().toISOString(),
    completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null,
  };
}

export type SerializedMachineDailySummary = Omit<MachineDailySummary, 'rebuiltAt'> & { rebuiltAt: string };

export function serializeMachineDailySummary(data: MachineDailySummary): SerializedMachineDailySummary {
  return { ...data, rebuiltAt: data.rebuiltAt.toDate().toISOString() };
}

export type SerializedPartnerDailySummary = Omit<PartnerDailySummary, 'rebuiltAt'> & { rebuiltAt: string };

export function serializePartnerDailySummary(data: PartnerDailySummary): SerializedPartnerDailySummary {
  return { ...data, rebuiltAt: data.rebuiltAt.toDate().toISOString() };
}
