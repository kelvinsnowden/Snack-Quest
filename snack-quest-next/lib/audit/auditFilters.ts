import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';

/** Areas people filter the audit log by, keyed by the entity type the entries are written with. */
export const AUDIT_AREAS: Record<string, string> = {
  business: 'Settings',
  staffProfile: 'Staff access',
  package: 'Boxes',
  snackItem: 'Snacks',
  order: 'Orders',
  paymentIntent: 'Payments',
  withdrawal: 'Withdrawals',
  creatorProfile: 'Creators',
  campaign: 'Campaigns',
  discountCode: 'Discount codes',
  marketingEmailCampaign: 'Email campaigns',
  marketingSmsCampaign: 'SMS campaigns',
  marketingSpendEntry: 'Marketing spend',
  storageObject: 'Storage',
  machine: 'Machines',
  machineSlot: 'Slots',
  machineAssortment: 'Machine catalogue',
  machineTransaction: 'Machine sales',
  machineInventoryMovement: 'Machine stock',
  restockTask: 'Restocks',
  machineCommand: 'Machine commands',
  deviceCredential: 'Screen keys',
  location: 'Locations',
  partner: 'Owners',
  partnerMachineAgreement: 'Owner agreements',
  machineSettlement: 'Settlements',
  machineSubscription: 'Subscriptions',
  alert: 'Alerts',
  camera: 'Cameras',
  cameraSnapshot: 'Camera snapshots',
  manufacturer: 'Manufacturers',
  machineModel: 'Machine models',
  machineIntegration: 'Machine integrations',
  integrationCredential: 'Integration keys',
  manufacturerApiCredential: 'Manufacturer API keys',
  kioskScreenImage: 'Screen artwork',
  kioskLayer: 'Screen designs',
  advertiser: 'Advertisers',
  adCreative: 'Ad creatives',
  adCampaign: 'Ad campaigns',
  adRevenue: 'Ad revenue',
  intelligenceRecommendation: 'Recommendations',
  scheduledJob: 'Scheduled jobs',
};

export interface AuditFilters {
  entityType?: string;
  actorId?: string;
  machineId?: string;
  machineCode?: string;
  since?: Date;
  until?: Date;
  /** The raw values, to put back in links and forms. */
  raw: { area: string; actor: string; machine: string; from: string; to: string };
  /** A machine code was given but no machine has it. */
  unknownMachine: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the audit filters from a query string. Dates are whole Nairobi days; `to` includes its day. */
export async function parseAuditFilters(businessId: string, params: URLSearchParams): Promise<AuditFilters> {
  const area = params.get('area') ?? '';
  const actor = params.get('actor') ?? '';
  const machine = (params.get('machine') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  let machineId: string | undefined;
  let unknownMachine = false;
  if (machine) {
    const found = await machineRepository.findByMachineCode(businessId, machine);
    if (found) machineId = found.id;
    else unknownMachine = true;
  }
  const nextDay = (date: string) => {
    const value = new Date(`${date}T00:00:00+03:00`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value;
  };
  return {
    entityType: area && Object.hasOwn(AUDIT_AREAS, area) ? area : undefined,
    actorId: actor || undefined,
    machineId,
    machineCode: machine || undefined,
    since: DATE.test(from) ? new Date(`${from}T00:00:00+03:00`) : undefined,
    until: DATE.test(to) ? nextDay(to) : undefined,
    raw: { area, actor, machine, from, to },
    unknownMachine,
  };
}

/** The query string for these filters, without paging. */
export function auditFilterQuery(raw: AuditFilters['raw']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (value) params.set(key, value);
  return params.toString();
}

/** The plain name of an entry's area, or its raw entity type when it has none. */
export function areaLabel(entityType: string): string {
  return Object.hasOwn(AUDIT_AREAS, entityType) ? AUDIT_AREAS[entityType] : entityType;
}
