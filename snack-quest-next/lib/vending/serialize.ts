import type {
  Machine,
  MachineAssortment,
  MachineCommand,
  MachineConnectivityStatus,
  MachineDailySummary,
  MachineSettlement,
  MachineSlot,
  MachineSubscription,
  MachineTransaction,
  Partner,
  PartnerDailySummary,
  PartnerEarningsLedgerEntry,
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

export interface SerializedMachineAssortment {
  machineId: string;
  productId: string;
  productCatalogue: MachineAssortment['productCatalogue'];
  assorted: boolean;
  slotCode: string | null;
  displayOrder: number;
  category: string | null;
  customerFacingName: string | null;
  customerFacingDescription: string | null;
  customerFacingImageUrl: string | null;
  priceOverrideKes: number | null;
  promotionalState: MachineAssortment['promotionalState'];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  visible: boolean;
  updatedAt: string;
}

export function serializeMachineAssortment(data: MachineAssortment): SerializedMachineAssortment {
  return {
    machineId: data.machineId,
    productId: data.productId,
    productCatalogue: data.productCatalogue,
    assorted: data.assorted,
    slotCode: data.slotCode,
    displayOrder: data.displayOrder,
    category: data.category,
    customerFacingName: data.customerFacingName,
    customerFacingDescription: data.customerFacingDescription,
    customerFacingImageUrl: data.customerFacingImageUrl,
    priceOverrideKes: data.priceOverrideKes,
    promotionalState: data.promotionalState,
    effectiveFrom: data.effectiveFrom ? data.effectiveFrom.toDate().toISOString() : null,
    effectiveTo: data.effectiveTo ? data.effectiveTo.toDate().toISOString() : null,
    visible: data.visible,
    updatedAt: data.updatedAt.toDate().toISOString(),
  };
}

export interface SerializedMachineSubscription {
  id: string;
  machineId: string;
  partnerId: string;
  planName: string;
  amountKes: number;
  frequency: MachineSubscription['frequency'];
  status: MachineSubscription['status'];
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  renewalDate: string;
  lastPaymentStatus: MachineSubscription['lastPaymentStatus'];
  lastPaidAt: string | null;
  arrearsKes: number;
  graceUntil: string | null;
}

export function serializeMachineSubscription(id: string, data: MachineSubscription): SerializedMachineSubscription {
  return {
    id,
    machineId: data.machineId,
    partnerId: data.partnerId,
    planName: data.planName,
    amountKes: data.amountKes,
    frequency: data.frequency,
    status: data.status,
    startDate: data.startDate.toDate().toISOString(),
    currentPeriodStart: data.currentPeriodStart.toDate().toISOString(),
    currentPeriodEnd: data.currentPeriodEnd.toDate().toISOString(),
    renewalDate: data.renewalDate.toDate().toISOString(),
    lastPaymentStatus: data.lastPaymentStatus,
    lastPaidAt: data.lastPaidAt ? data.lastPaidAt.toDate().toISOString() : null,
    arrearsKes: data.arrearsKes,
    graceUntil: data.graceUntil ? data.graceUntil.toDate().toISOString() : null,
  };
}

export interface SerializedMachineSettlement {
  id: string;
  machineId: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  status: MachineSettlement['status'];
  grossSalesKes: number;
  refundsKes: number;
  cogsKes: number;
  unpricedSaleCount: number;
  subscriptionChargedKes: number;
  adjustmentKes: number;
  adjustmentReason: string | null;
  distributableOwnerKes: number;
  netDistributableKes: number | null;
  partnerShareKes: number | null;
  businessShareKes: number | null;
  finalizedAt: string | null;
  paidAt: string | null;
}

export function serializeMachineSettlement(id: string, data: MachineSettlement): SerializedMachineSettlement {
  return {
    id,
    machineId: data.machineId,
    partnerId: data.partnerId,
    periodStart: data.periodStart.toDate().toISOString(),
    periodEnd: data.periodEnd.toDate().toISOString(),
    status: data.status,
    grossSalesKes: data.grossSalesKes,
    refundsKes: data.refundsKes,
    cogsKes: data.cogsKes,
    unpricedSaleCount: data.unpricedSaleCount,
    subscriptionChargedKes: data.subscriptionChargedKes,
    adjustmentKes: data.adjustmentKes,
    adjustmentReason: data.adjustmentReason,
    distributableOwnerKes: data.distributableOwnerKes,
    netDistributableKes: data.netDistributableKes,
    partnerShareKes: data.partnerShareKes,
    businessShareKes: data.businessShareKes,
    finalizedAt: data.finalizedAt ? data.finalizedAt.toDate().toISOString() : null,
    paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
  };
}

export interface SerializedPartnerWallet {
  partnerId: string;
  name: string;
  status: Partner['status'];
  availableCashKes: number;
  lifetimeEarnedKes: number;
}

export function serializePartnerWallet(id: string, data: Partner): SerializedPartnerWallet {
  return {
    partnerId: id,
    name: data.name,
    status: data.status,
    availableCashKes: data.availableCashKes,
    lifetimeEarnedKes: data.lifetimeEarnedKes,
  };
}

export interface SerializedPartnerEarningsLedgerEntry {
  type: PartnerEarningsLedgerEntry['type'];
  settlementId: string;
  machineId: string;
  amountKes: number;
  createdAt: string;
}

export function serializePartnerEarningsLedgerEntry(data: PartnerEarningsLedgerEntry): SerializedPartnerEarningsLedgerEntry {
  return {
    type: data.type,
    settlementId: data.settlementId,
    machineId: data.machineId,
    amountKes: data.amountKes,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}
