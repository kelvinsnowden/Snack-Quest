import 'server-only';

import { parseSheetRow, type SheetRow } from '@/lib/leads/sheetRow';
import { readSheetRows } from '@/lib/integrations/googleSheets';
import { toMillis } from '@/lib/firestoreTimestamp';
import { machineOwnerInterestRepository } from '@/repositories/machineOwnerInterestRepository';
import { vendingLeadRepository, type VendingLeadPatch } from '@/repositories/vendingLeadRepository';
import {
  BUILDING_PORTFOLIO_OPTIONS,
  CAPITAL_RANGES,
  LOCATION_ACCESS_OPTIONS,
  LOCATION_COUNTS,
  LOCATION_TYPES,
  OWNER_PROFILES,
  type MachineOwnerInterest,
} from '@/types/machineOwnerInterest';
import {
  VENDING_LEAD_SEGMENTS,
  VENDING_LEAD_STATUSES,
  type VendingLeadSegment,
  type VendingLeadSourceFields,
  type VendingLeadStatus,
} from '@/types/vendingLead';

export class VendingLeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendingLeadValidationError';
  }
}

export class VendingLeadNotFoundError extends Error {
  constructor() {
    super('That lead no longer exists.');
    this.name = 'VendingLeadNotFoundError';
  }
}

/** Per request — the Apps Script sends in batches well under this. */
export const MAX_SHEET_ROWS_PER_REQUEST = 500;
const MAX_NOTE_LENGTH = 2000;
const MAX_OWN_IMPORT = 1000;

export interface SheetIngestResult {
  received: number;
  created: number;
  updated: number;
  skipped: number;
}

function labelOf<T extends string>(options: readonly { value: T; label: string }[], value: T | null): string {
  if (!value) return '';
  return options.find((option) => option.value === value)?.label ?? value;
}

/** An `/own` application, in the same shape as a Meta lead so both sit in one list. */
type OwnApplication = Omit<MachineOwnerInterest, 'createdAt' | 'updatedAt' | 'status'>;

export function ownApplicationToLeadFields(id: string, data: OwnApplication, submittedAtMs: number): VendingLeadSourceFields {
  const answers = [
    { label: 'Capital to deploy', value: labelOf(CAPITAL_RANGES, data.capitalRange) },
    { label: 'Access to a location', value: labelOf(LOCATION_ACCESS_OPTIONS, data.locationAccess) },
    { label: 'How many locations', value: labelOf(LOCATION_COUNTS, data.locationCount) },
    {
      label: 'Location types',
      value: (data.locationTypes ?? []).map((type) => labelOf(LOCATION_TYPES, type)).join(', '),
    },
    { label: 'Describes them best', value: labelOf(OWNER_PROFILES, data.ownerProfile) },
    { label: 'Building a portfolio', value: labelOf(BUILDING_PORTFOLIO_OPTIONS, data.buildingPortfolio) },
  ].filter((answer) => answer.value.length > 0);

  return {
    source: 'own_form',
    externalId: id,
    fullName: data.fullName,
    phone: data.whatsapp,
    email: data.email,
    campaignName: null,
    adName: null,
    formName: 'snackquests.shop/own',
    platform: null,
    answers,
    submittedAtMs,
  };
}

function ownSegment(data: Pick<MachineOwnerInterest, 'ownerProfile'>): VendingLeadSegment {
  return data.ownerProfile === 'locations' ? 'host' : 'investor';
}

/**
 * The vending leads CRM (§ vending leads CRM): one inbox for everyone
 * who raised a hand, from Meta lead forms (via the Google Sheet) and
 * the website's `/own` form, with a pipeline status, notes and a
 * follow-up date per lead.
 */
class VendingLeadService {
  async ingestSheetRows(rows: unknown): Promise<SheetIngestResult> {
    if (!Array.isArray(rows)) {
      throw new VendingLeadValidationError('Expected "rows" to be a list of objects.');
    }
    if (rows.length > MAX_SHEET_ROWS_PER_REQUEST) {
      throw new VendingLeadValidationError(`Send at most ${MAX_SHEET_ROWS_PER_REQUEST} rows per request.`);
    }

    const result: SheetIngestResult = { received: rows.length, created: 0, updated: 0, skipped: 0 };
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        result.skipped += 1;
        continue;
      }
      const parsed = parseSheetRow(row as SheetRow);
      if (!parsed) {
        result.skipped += 1;
        continue;
      }
      const created = await vendingLeadRepository.upsertFromSource(parsed.fields, parsed.segment);
      if (created) result.created += 1;
      else result.updated += 1;
    }
    return result;
  }

  /**
   * Pulls every row of the Meta leads Google Sheet and ingests it — the
   * app reads the sheet itself, so nothing has to run inside Google.
   * `LEADS_SHEET_ID` is the long id in the sheet's URL; `LEADS_SHEET_TAB`
   * is optional (blank reads the first tab). Returns null when the sheet
   * isn't configured. Re-ingesting is idempotent per Meta lead id.
   */
  async syncFromGoogleSheet(): Promise<SheetIngestResult | null> {
    const spreadsheetId = process.env.LEADS_SHEET_ID?.trim();
    if (!spreadsheetId) return null;
    const rows = await readSheetRows(spreadsheetId, process.env.LEADS_SHEET_TAB?.trim() || undefined);
    const total: SheetIngestResult = { received: 0, created: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < rows.length; i += MAX_SHEET_ROWS_PER_REQUEST) {
      const batch = await this.ingestSheetRows(rows.slice(i, i + MAX_SHEET_ROWS_PER_REQUEST));
      total.received += batch.received;
      total.created += batch.created;
      total.updated += batch.updated;
      total.skipped += batch.skipped;
    }
    return total;
  }

  /** Called right after an `/own` application is saved. Never throws — the application itself already succeeded. */
  async mirrorOwnApplication(id: string, data: OwnApplication): Promise<void> {
    try {
      await vendingLeadRepository.upsertFromSource(ownApplicationToLeadFields(id, data, Date.now()), ownSegment(data));
    } catch (error) {
      console.error('[vendingLeadService] could not copy /own application into leads', error);
    }
  }

  /** Copies every `/own` application not already in the CRM. Safe to run any number of times. */
  async importOwnApplications(): Promise<{ imported: number; alreadyThere: number }> {
    const applications = await machineOwnerInterestRepository.listRecent(MAX_OWN_IMPORT);
    let imported = 0;
    let alreadyThere = 0;
    for (const { id, data } of applications) {
      if (await vendingLeadRepository.exists('own_form', id)) {
        alreadyThere += 1;
        continue;
      }
      const submittedAtMs = toMillis(data.createdAt) || Date.now();
      await vendingLeadRepository.upsertFromSource(ownApplicationToLeadFields(id, data, submittedAtMs), ownSegment(data));
      imported += 1;
    }
    return { imported, alreadyThere };
  }

  async listRecent() {
    return vendingLeadRepository.listRecent();
  }

  async updateLead(
    leadId: string,
    input: { status?: unknown; segment?: unknown; nextFollowUpAtMs?: unknown; note?: unknown },
    actor: { uid: string; name: string | null },
  ): Promise<void> {
    const patch: VendingLeadPatch = {};

    if (input.status !== undefined) {
      if (!VENDING_LEAD_STATUSES.some((option) => option.value === input.status)) {
        throw new VendingLeadValidationError('Unknown status.');
      }
      patch.status = input.status as VendingLeadStatus;
    }
    if (input.segment !== undefined) {
      if (!VENDING_LEAD_SEGMENTS.some((option) => option.value === input.segment)) {
        throw new VendingLeadValidationError('Unknown segment.');
      }
      patch.segment = input.segment as VendingLeadSegment;
    }
    if (input.nextFollowUpAtMs !== undefined) {
      if (input.nextFollowUpAtMs === null) {
        patch.nextFollowUpAtMs = null;
      } else if (typeof input.nextFollowUpAtMs === 'number' && Number.isFinite(input.nextFollowUpAtMs)) {
        patch.nextFollowUpAtMs = Math.trunc(input.nextFollowUpAtMs);
      } else {
        throw new VendingLeadValidationError('Follow-up date is not a valid date.');
      }
    }

    let note = null;
    if (input.note !== undefined && input.note !== null && input.note !== '') {
      if (typeof input.note !== 'string') {
        throw new VendingLeadValidationError('Note must be text.');
      }
      const text = input.note.trim();
      if (text.length > MAX_NOTE_LENGTH) {
        throw new VendingLeadValidationError(`Keep notes under ${MAX_NOTE_LENGTH} characters.`);
      }
      if (text) {
        note = { text, by: actor.uid, byName: actor.name, atMs: Date.now() };
      }
    }

    if (Object.keys(patch).length === 0 && !note) {
      throw new VendingLeadValidationError('Nothing to change.');
    }

    const existing = await vendingLeadRepository.findById(leadId);
    if (!existing) {
      throw new VendingLeadNotFoundError();
    }
    await vendingLeadRepository.update(leadId, patch, note);
  }
}

export const vendingLeadService = new VendingLeadService();
export { VendingLeadService };
