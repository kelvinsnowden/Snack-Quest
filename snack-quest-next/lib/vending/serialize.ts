import type {
  Alert,
  IntelligenceRecommendation,
  Location,
  Machine,
  MachineAssortment,
  MachineCommand,
  MachineConnectivityStatus,
  MachineDailySummary,
  MachineSettlement,
  MachineSlot,
  MachineSubscription,
  MachineTransaction,
  NetworkDailySummary,
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
  dispenseFailureStatus: MachineTransaction['dispenseFailureStatus'];
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
    dispenseFailureStatus: data.dispenseFailureStatus,
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

export type SerializedRestockTaskItem = Omit<RestockTask['items'][number], 'expiresAt'> & { expiresAt: string | null };

export interface SerializedRestockTask {
  id: string;
  machineId: string;
  warehouseId: string | null;
  items: SerializedRestockTaskItem[];
  status: RestockTask['status'];
  priority: RestockTask['priority'];
  pickedBy: string | null;
  pickedAt: string | null;
  dispatchedBy: string | null;
  dispatchedAt: string | null;
  receivedBy: string | null;
  discrepancyNote: string | null;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function serializeRestockTask(id: string, data: RestockTask): SerializedRestockTask {
  return {
    id,
    machineId: data.machineId,
    warehouseId: data.warehouseId,
    items: data.items.map((item) => ({ ...item, expiresAt: item.expiresAt ? item.expiresAt.toDate().toISOString() : null })),
    status: data.status,
    priority: data.priority,
    pickedBy: data.pickedBy,
    pickedAt: data.pickedAt ? data.pickedAt.toDate().toISOString() : null,
    dispatchedBy: data.dispatchedBy,
    dispatchedAt: data.dispatchedAt ? data.dispatchedAt.toDate().toISOString() : null,
    receivedBy: data.receivedBy,
    discrepancyNote: data.discrepancyNote,
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

export type SerializedNetworkDailySummary = Omit<NetworkDailySummary, 'rebuiltAt'> & { rebuiltAt: string };

export function serializeNetworkDailySummary(data: NetworkDailySummary): SerializedNetworkDailySummary {
  return { ...data, rebuiltAt: data.rebuiltAt.toDate().toISOString() };
}

export interface SerializedIntelligenceRecommendation {
  id: string;
  type: IntelligenceRecommendation['type'];
  target: IntelligenceRecommendation['target'];
  reason: string;
  supportingMetrics: IntelligenceRecommendation['supportingMetrics'];
  confidence: IntelligenceRecommendation['confidence'];
  status: IntelligenceRecommendation['status'];
  actionTaken: string | null;
  actionedAt: string | null;
  actionedBy: string | null;
  outcome: string | null;
  outcomeMetrics: IntelligenceRecommendation['outcomeMetrics'];
  outcomeRecordedAt: string | null;
  createdAt: string;
}

export function serializeIntelligenceRecommendation(id: string, data: IntelligenceRecommendation): SerializedIntelligenceRecommendation {
  return {
    id,
    type: data.type,
    target: data.target,
    reason: data.reason,
    supportingMetrics: data.supportingMetrics,
    confidence: data.confidence,
    status: data.status,
    actionTaken: data.actionTaken,
    actionedAt: data.actionedAt ? data.actionedAt.toDate().toISOString() : null,
    actionedBy: data.actionedBy,
    outcome: data.outcome,
    outcomeMetrics: data.outcomeMetrics,
    outcomeRecordedAt: data.outcomeRecordedAt ? data.outcomeRecordedAt.toDate().toISOString() : null,
    createdAt: data.createdAt.toDate().toISOString(),
  };
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

export interface SerializedLocation {
  id: string;
  name: string;
  locationType: Location['locationType'];
  city: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  estimatedFootTraffic: number | null;
  operatingHours: string | null;
  customerType: Location['customerType'];
  indoorOutdoor: Location['indoorOutdoor'];
  nearbyBusinesses: string[];
  competingFoodBeverageOutlets: string[];
  launchDate: string | null;
  notes: string | null;
  machineCount: number;
}

export function serializeLocation(id: string, data: Location, machineCount: number): SerializedLocation {
  return {
    id,
    name: data.name,
    locationType: data.locationType,
    city: data.city,
    area: data.area,
    address: data.address,
    latitude: data.latitude,
    longitude: data.longitude,
    estimatedFootTraffic: data.estimatedFootTraffic,
    operatingHours: data.operatingHours,
    customerType: data.customerType,
    indoorOutdoor: data.indoorOutdoor,
    nearbyBusinesses: data.nearbyBusinesses,
    competingFoodBeverageOutlets: data.competingFoodBeverageOutlets,
    launchDate: data.launchDate ? data.launchDate.toDate().toISOString() : null,
    notes: data.notes,
    machineCount,
  };
}

export interface SerializedAlert {
  id: string;
  type: Alert['type'];
  severity: Alert['severity'];
  machineId: string | null;
  locationId: string | null;
  title: string;
  detail: string;
  status: Alert['status'];
  assignee: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export function serializeAlert(id: string, data: Alert): SerializedAlert {
  return {
    id,
    type: data.type,
    severity: data.severity,
    machineId: data.machineId,
    locationId: data.locationId,
    title: data.title,
    detail: data.detail,
    status: data.status,
    assignee: data.assignee,
    resolution: data.resolution,
    resolvedAt: data.resolvedAt ? data.resolvedAt.toDate().toISOString() : null,
    resolvedBy: data.resolvedBy,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}
