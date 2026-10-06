import 'server-only';

import { createHash } from 'node:crypto';
import { advertisingRepository, AdNotFoundError, type NewPlaybackEvent } from '@/repositories/advertisingRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { storageService } from '@/services/storageService';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { buildMachinePlaylist, nairobiClock, type MachinePlaylist } from '@/lib/ads/playlist';
import {
  AD_BILLING_MODELS,
  AD_DIRECT_VIDEO_MAX_BYTES,
  AD_IN_BAND_MAX_BYTES,
  AD_MEDIA_TYPES,
  AD_PLAYBACK_EVENT_TYPES,
  type AdBillingModel,
  type AdCampaign,
  type AdCreative,
  type AdDailyStat,
  type AdMimeType,
  type AdOwnerShare,
  type AdPlaybackEventType,
  type AdRevenueEntry,
  type AdSchedule,
  type AdTargeting,
  type Advertiser,
  type AdvertiserKind,
} from '@/types/advertising';
import type { Machine } from '@/types';

export class AdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdValidationError';
  }
}

export class AdStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdStateError';
  }
}

export { AdNotFoundError };

export const AD_LIMITS = {
  maxBytes: AD_IN_BAND_MAX_BYTES,
  /** Videos uploaded straight to storage (§ AD SECURITY — direct upload). Above `maxBytes`, which is what a request through our own server can carry. */
  maxDirectVideoBytes: AD_DIRECT_VIDEO_MAX_BYTES,
  imageSecondsMin: 3,
  imageSecondsMax: 30,
  videoSecondsMin: 1,
  videoSecondsMax: 60,
  nameMax: 80,
  eventsPerBatch: 500,
  weightMax: 10,
  capMax: 60,
  priceMaxKes: 10_000_000,
} as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const CLIENT_EVENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** How long cached campaigns are trusted when building a machine's playlist. A publish on the same instance clears it. */
const CAMPAIGN_CACHE_MS = 30_000;

const campaignCache = new Map<string, { at: number; campaigns: { id: string; data: AdCampaign }[]; creatives: Map<string, AdCreative> }>();

export function resetAdvertisingCache(): void {
  campaignCache.clear();
}

/** The first bytes of each allowed container. A file whose bytes don't match its declared type is refused — so a script renamed `.mp4` never reaches a machine. */
/** Where a business's directly uploaded ad videos must land. The upload token only allows this folder. */
export function directUploadPrefix(businessId: string): string {
  return `ads/${businessId}/`;
}

function bytesMatch(mimeType: AdMimeType, data: Buffer): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/png':
      return data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return data.length > 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'video/mp4':
      return data.length > 12 && data.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'video/webm':
      return data.length > 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
}

function cleanText(value: unknown, label: string, max: number, required = true): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new AdValidationError(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new AdValidationError(`${label} must be text.`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new AdValidationError(`Keep ${label.toLowerCase()} under ${max} characters.`);
  return text;
}

function ids(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) throw new AdValidationError(`${label} must be a list of ids.`);
  return [...new Set(value as string[])];
}

export function parseSchedule(input: unknown): AdSchedule {
  const value = (input ?? {}) as Record<string, unknown>;
  if (typeof value.startDate !== 'string' || !DATE.test(value.startDate)) throw new AdValidationError('Choose a start date.');
  const endDate = value.endDate === null || value.endDate === undefined || value.endDate === '' ? null : value.endDate;
  if (endDate !== null && (typeof endDate !== 'string' || !DATE.test(endDate))) throw new AdValidationError('The end date must be a date.');
  if (endDate !== null && endDate < value.startDate) throw new AdValidationError('The campaign can’t end before it starts.');
  const days = Array.isArray(value.daysOfWeek) ? value.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) throw new AdValidationError('Choose at least one day of the week.');
  const startMinute = value.startMinute ?? 0;
  const endMinute = value.endMinute ?? 1440;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || (startMinute as number) < 0 || (endMinute as number) > 1440 || (startMinute as number) >= (endMinute as number)) {
    throw new AdValidationError('The daily start time must be before the end time.');
  }
  return { startDate: value.startDate, endDate: endDate as string | null, daysOfWeek: [...new Set(days as number[])].sort(), startMinute: startMinute as number, endMinute: endMinute as number };
}

export function parseTargeting(input: unknown): AdTargeting {
  const value = (input ?? {}) as Record<string, unknown>;
  const targeting: AdTargeting = {
    allMachines: value.allMachines === true,
    machineIds: ids(value.machineIds, 'Machines'),
    locationIds: ids(value.locationIds, 'Locations'),
    ownerPartnerIds: ids(value.ownerPartnerIds, 'Owners'),
  };
  if (!targeting.allMachines && targeting.machineIds.length + targeting.locationIds.length + targeting.ownerPartnerIds.length === 0) {
    throw new AdValidationError('Choose where the campaign plays: every machine, or some machines, locations or owners.');
  }
  return targeting;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CampaignInput {
  advertiserId: string;
  name: unknown;
  creativeIds: unknown;
  schedule: unknown;
  targeting: unknown;
  weight: unknown;
  frequencyCapPerHour: unknown;
  billingModel: unknown;
  priceKes: unknown;
}

/**
 * Advertising on the idle screen (§ IDLE / ATTRACT ADVERTISING ENGINE):
 * advertisers, creatives with review, campaigns with schedule, targeting,
 * weights and caps, each machine's playlist, deduplicated playback
 * reporting, statistics, and revenue with the owners' share.
 */
class AdvertisingService {
  // ── Advertisers ───────────────────────────────────────────────────────
  async createAdvertiser(businessId: string, input: Record<string, unknown>, actor: string): Promise<string> {
    const kind = input.kind === 'internal' ? 'internal' : input.kind === 'external' || input.kind === undefined ? 'external' : null;
    if (!kind) throw new AdValidationError('An advertiser is external (a paying brand) or internal (Snack Quest).');
    const email = cleanText(input.contactEmail, 'Email', 120, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdValidationError('That email address doesn’t look right.');
    return advertisingRepository.createAdvertiser({
      businessId,
      name: cleanText(input.name, 'Name', AD_LIMITS.nameMax)!,
      kind: kind as AdvertiserKind,
      contactName: cleanText(input.contactName, 'Contact name', 80, false),
      contactEmail: email,
      contactPhone: cleanText(input.contactPhone, 'Phone', 30, false),
      notes: cleanText(input.notes, 'Notes', 500, false),
      active: true,
      createdBy: actor,
    });
  }

  async updateAdvertiser(businessId: string, id: string, input: Record<string, unknown>): Promise<void> {
    const fields: Partial<Pick<Advertiser, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes' | 'active'>> = {};
    if (input.name !== undefined) fields.name = cleanText(input.name, 'Name', AD_LIMITS.nameMax)!;
    if (input.contactName !== undefined) fields.contactName = cleanText(input.contactName, 'Contact name', 80, false);
    if (input.contactEmail !== undefined) fields.contactEmail = cleanText(input.contactEmail, 'Email', 120, false);
    if (input.contactPhone !== undefined) fields.contactPhone = cleanText(input.contactPhone, 'Phone', 30, false);
    if (input.notes !== undefined) fields.notes = cleanText(input.notes, 'Notes', 500, false);
    if (input.active !== undefined) {
      if (typeof input.active !== 'boolean') throw new AdValidationError('Active must be on or off.');
      fields.active = input.active;
    }
    await advertisingRepository.updateAdvertiser(businessId, id, fields);
  }

  listAdvertisers(businessId: string) {
    return advertisingRepository.listAdvertisers(businessId);
  }

  // ── Creatives ─────────────────────────────────────────────────────────
  /**
   * Checks an uploaded file, stores it and records it as waiting for
   * review. The type must be allowed, the bytes must match the type, and
   * the checksum is computed here from the bytes themselves.
   */
  async uploadCreative(input: { businessId: string; advertiserId: string; name: unknown; filename: string; contentType: string; data: Buffer; durationSeconds: unknown; actor: string }): Promise<{ id: string; creative: Omit<AdCreative, 'createdAt' | 'updatedAt' | 'reviewedAt'> }> {
    const advertiser = await advertisingRepository.findAdvertiser(input.businessId, input.advertiserId);
    if (!advertiser) throw new AdNotFoundError('Advertiser', input.advertiserId);
    const mimeType = input.contentType as AdMimeType;
    if (!(mimeType in AD_MEDIA_TYPES)) throw new AdValidationError('Use a JPG, PNG or WebP image, or an MP4 or WebM video.');
    if (input.data.byteLength === 0) throw new AdValidationError('The file is empty.');
    if (input.data.byteLength > AD_LIMITS.maxBytes) throw new AdValidationError('Keep ad files under 4 MB.');
    if (!bytesMatch(mimeType, input.data)) throw new AdValidationError('The file’s contents don’t match its type. It may be damaged or mislabelled.');
    const mediaKind = AD_MEDIA_TYPES[mimeType];
    const seconds = Number(input.durationSeconds);
    const [min, max] = mediaKind === 'image' ? [AD_LIMITS.imageSecondsMin, AD_LIMITS.imageSecondsMax] : [AD_LIMITS.videoSecondsMin, AD_LIMITS.videoSecondsMax];
    if (!Number.isInteger(seconds) || seconds < min || seconds > max) throw new AdValidationError(`${mediaKind === 'image' ? 'An image shows' : 'A video runs'} for ${min} to ${max} seconds.`);
    const name = cleanText(input.name, 'Name', AD_LIMITS.nameMax)!;
    const sha256 = createHash('sha256').update(input.data).digest('hex');
    const uploaded = await storageService.uploadFile({ businessId: input.businessId, directory: 'ads', filename: input.filename, data: input.data, contentType: mimeType });
    return this.recordCreative({ businessId: input.businessId, advertiserId: input.advertiserId, name, mimeType, mediaUrl: uploaded.url, bytes: input.data.byteLength, sha256, durationSeconds: seconds, actor: input.actor });
  }

  private async recordCreative(input: { businessId: string; advertiserId: string; name: string; mimeType: AdMimeType; mediaUrl: string; bytes: number; sha256: string; durationSeconds: number; actor: string }) {
    const creative = {
      businessId: input.businessId,
      advertiserId: input.advertiserId,
      name: input.name,
      mimeType: input.mimeType,
      mediaKind: AD_MEDIA_TYPES[input.mimeType],
      mediaUrl: input.mediaUrl,
      bytes: input.bytes,
      sha256: input.sha256,
      durationSeconds: input.durationSeconds,
      status: 'pending_review' as const,
      reviewedBy: null,
      reviewNote: null,
      createdBy: input.actor,
    };
    const id = await advertisingRepository.createCreative({ ...creative, reviewedAt: null });
    return { id, creative };
  }

  /**
   * Records a video the browser uploaded straight to storage (one too big
   * to pass through our own server). Nothing the browser says about the
   * file is trusted: storage is asked for its real path, type and size,
   * the path must be this business's ad folder, and the bytes are read
   * back here to check they are the video they claim to be and to compute
   * the checksum a machine verifies. A file that fails is deleted. Like
   * any creative it then waits for review.
   */
  async finalizeDirectVideo(input: { businessId: string; advertiserId: string; name: unknown; url: unknown; durationSeconds: unknown; actor: string }) {
    const advertiser = await advertisingRepository.findAdvertiser(input.businessId, input.advertiserId);
    if (!advertiser) throw new AdNotFoundError('Advertiser', input.advertiserId);
    const name = cleanText(input.name, 'Name', AD_LIMITS.nameMax)!;
    const seconds = Number(input.durationSeconds);
    if (!Number.isInteger(seconds) || seconds < AD_LIMITS.videoSecondsMin || seconds > AD_LIMITS.videoSecondsMax) throw new AdValidationError(`A video runs for ${AD_LIMITS.videoSecondsMin} to ${AD_LIMITS.videoSecondsMax} seconds.`);
    if (typeof input.url !== 'string' || !/^https:\/\//.test(input.url)) throw new AdValidationError('Upload the video first.');

    let stored;
    try {
      stored = await storageService.describeFile(input.url);
    } catch {
      throw new AdValidationError('That upload wasn’t found. Upload the video again.');
    }
    // Only this business's ad folder. Anything else is not ours to record — or to delete.
    if (!stored.pathname.startsWith(`${directUploadPrefix(input.businessId)}`) || stored.pathname.includes('..')) throw new AdValidationError('That upload wasn’t found. Upload the video again.');
    if (await advertisingRepository.creativeExistsForMediaUrl(input.businessId, stored.url)) throw new AdStateError('That video is already recorded as a creative.');

    const reject = async (message: string): Promise<never> => {
      await storageService.deleteFile(stored.url).catch(() => undefined);
      throw new AdValidationError(message);
    };
    const mimeType = stored.contentType as AdMimeType;
    if (AD_MEDIA_TYPES[mimeType] !== 'video') return reject('Only MP4 or WebM videos can be uploaded this way.');
    if (stored.size <= 0) return reject('The file is empty.');
    if (stored.size > AD_LIMITS.maxDirectVideoBytes) return reject(`Keep ad videos under ${AD_LIMITS.maxDirectVideoBytes / (1024 * 1024)} MB.`);

    const hash = createHash('sha256');
    let bytes = 0;
    let head = Buffer.alloc(0);
    try {
      const reader = (await storageService.openFile(stored.url)).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > AD_LIMITS.maxDirectVideoBytes) {
          await reader.cancel();
          return reject(`Keep ad videos under ${AD_LIMITS.maxDirectVideoBytes / (1024 * 1024)} MB.`);
        }
        if (head.length < 16) head = Buffer.concat([head, Buffer.from(value.subarray(0, 16 - head.length))]);
        hash.update(value);
      }
    } catch (error) {
      if (error instanceof AdValidationError) throw error;
      throw new AdValidationError('The uploaded video couldn’t be read back. Try again.');
    }
    if (bytes !== stored.size) return reject('The upload is incomplete. Upload the video again.');
    if (!bytesMatch(mimeType, head)) return reject('The file’s contents don’t match its type. It may be damaged or mislabelled.');
    return this.recordCreative({ businessId: input.businessId, advertiserId: input.advertiserId, name, mimeType, mediaUrl: stored.url, bytes, sha256: hash.digest('hex'), durationSeconds: seconds, actor: input.actor });
  }

  /** Approve or reject. Rejecting needs a reason; an approved creative can be pulled (rejected) later, which stops it on every machine at the next sync. */
  async reviewCreative(businessId: string, id: string, decision: unknown, note: unknown, actor: string) {
    if (decision !== 'approved' && decision !== 'rejected') throw new AdValidationError('Decide “approved” or “rejected”.');
    const reason = cleanText(note, 'Reason', 300, decision === 'rejected');
    const result = await advertisingRepository.reviewCreative(businessId, id, (current) => {
      if (current.status === decision) throw new AdStateError(`This creative is already ${decision}.`);
      if (current.status === 'rejected') throw new AdStateError('A rejected creative can’t be approved; upload a corrected one.');
      return { status: decision, reviewNote: reason, reviewedBy: actor };
    });
    campaignCache.delete(businessId);
    return result;
  }

  listCreatives(businessId: string) {
    return advertisingRepository.listCreatives(businessId);
  }

  // ── Campaigns ─────────────────────────────────────────────────────────
  private async parseCampaign(businessId: string, input: CampaignInput, advertiserKind: AdvertiserKind) {
    const creativeIds = ids(input.creativeIds, 'Creatives');
    if (creativeIds.length > 20) throw new AdValidationError('A campaign can rotate at most 20 creatives.');
    const creatives = await advertisingRepository.findCreatives(businessId, creativeIds);
    for (const id of creativeIds) {
      const creative = creatives.get(id);
      if (!creative) throw new AdNotFoundError('Creative', id);
      if (creative.status === 'rejected') throw new AdValidationError(`“${creative.name}” was rejected and can’t be used.`);
    }
    const weight = input.weight === undefined ? 1 : Number(input.weight);
    if (!Number.isInteger(weight) || weight < 1 || weight > AD_LIMITS.weightMax) throw new AdValidationError(`Weight is a whole number from 1 to ${AD_LIMITS.weightMax}.`);
    const cap = input.frequencyCapPerHour === undefined || input.frequencyCapPerHour === null || input.frequencyCapPerHour === '' ? null : Number(input.frequencyCapPerHour);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > AD_LIMITS.capMax)) throw new AdValidationError(`The hourly cap is 1 to ${AD_LIMITS.capMax} plays, or none.`);
    const billingModel = (input.billingModel ?? 'none') as AdBillingModel;
    if (!(AD_BILLING_MODELS as readonly string[]).includes(billingModel)) throw new AdValidationError('Choose how the campaign is billed.');
    const priceKes = billingModel === 'none' ? 0 : Number(input.priceKes);
    if (billingModel !== 'none' && (!Number.isFinite(priceKes) || priceKes <= 0 || priceKes > AD_LIMITS.priceMaxKes)) throw new AdValidationError('Enter the price for the billing model.');
    if (advertiserKind === 'internal' && billingModel !== 'none') throw new AdValidationError('Snack Quest’s own campaigns aren’t billed.');
    return {
      name: cleanText(input.name, 'Name', AD_LIMITS.nameMax)!,
      creativeIds,
      schedule: parseSchedule(input.schedule),
      targeting: parseTargeting(input.targeting),
      weight,
      frequencyCapPerHour: cap,
      billingModel,
      priceKes: round2(priceKes),
    };
  }

  async createCampaign(businessId: string, input: CampaignInput, actor: string): Promise<string> {
    const advertiser = await advertisingRepository.findAdvertiser(businessId, input.advertiserId);
    if (!advertiser) throw new AdNotFoundError('Advertiser', input.advertiserId);
    if (!advertiser.active) throw new AdStateError('That advertiser is inactive.');
    const parsed = await this.parseCampaign(businessId, input, advertiser.kind);
    return advertisingRepository.createCampaign({ businessId, advertiserId: input.advertiserId, advertiserKind: advertiser.kind, status: 'draft', createdBy: actor, ...parsed });
  }

  /** Only drafts and paused campaigns change: what plays on machines is always exactly what was published. */
  async updateCampaign(businessId: string, id: string, input: Omit<CampaignInput, 'advertiserId'>) {
    const current = await advertisingRepository.findCampaign(businessId, id);
    if (!current) throw new AdNotFoundError('Campaign', id);
    const parsed = await this.parseCampaign(businessId, { ...input, advertiserId: current.advertiserId }, current.advertiserKind);
    const result = await advertisingRepository.mutateCampaign(businessId, id, (latest) => {
      if (latest.status !== 'draft' && latest.status !== 'paused') throw new AdStateError('Pause the campaign before changing it.');
      return parsed;
    });
    campaignCache.delete(businessId);
    return result;
  }

  /** draft|paused → active. Every creative must be approved, and the campaign can't already be over. */
  async publishCampaign(businessId: string, id: string, actor: string) {
    const campaign = await advertisingRepository.findCampaign(businessId, id);
    if (!campaign) throw new AdNotFoundError('Campaign', id);
    if (campaign.creativeIds.length === 0) throw new AdStateError('Add at least one creative first.');
    const creatives = await advertisingRepository.findCreatives(businessId, campaign.creativeIds);
    const unapproved = campaign.creativeIds.filter((creativeId) => creatives.get(creativeId)?.status !== 'approved');
    if (unapproved.length > 0) throw new AdStateError(`Every creative must be approved before the campaign runs (${unapproved.length} isn’t).`);
    const advertiser = await advertisingRepository.findAdvertiser(businessId, campaign.advertiserId);
    if (!advertiser?.active) throw new AdStateError('That advertiser is inactive.');
    const today = nairobiClock(new Date()).date;
    if (campaign.schedule.endDate !== null && campaign.schedule.endDate < today) throw new AdStateError('The campaign’s end date has passed.');
    const result = await advertisingRepository.mutateCampaign(businessId, id, (latest) => {
      if (latest.status !== 'draft' && latest.status !== 'paused') throw new AdStateError(`A ${latest.status} campaign can’t be started.`);
      return { status: 'active', publishedBy: actor, publishedAt: new Date() as unknown as AdCampaign['publishedAt'] };
    });
    campaignCache.delete(businessId);
    return result;
  }

  async setCampaignStatus(businessId: string, id: string, target: 'paused' | 'ended' | 'cancelled') {
    const allowed: Record<typeof target, AdCampaign['status'][]> = { paused: ['active'], ended: ['active', 'paused'], cancelled: ['draft', 'active', 'paused'] };
    const result = await advertisingRepository.mutateCampaign(businessId, id, (latest) => {
      if (!allowed[target].includes(latest.status)) throw new AdStateError(`A ${latest.status} campaign can’t be ${target}.`);
      return { status: target };
    });
    campaignCache.delete(businessId);
    return result;
  }

  listCampaigns(businessId: string) {
    return advertisingRepository.listCampaigns(businessId);
  }

  getCampaign(businessId: string, id: string) {
    return advertisingRepository.findCampaign(businessId, id);
  }

  // ── Playlist ──────────────────────────────────────────────────────────
  private async activeCampaigns(businessId: string) {
    const cached = campaignCache.get(businessId);
    if (cached && Date.now() - cached.at < CAMPAIGN_CACHE_MS) return cached;
    const campaigns = await advertisingRepository.listActiveCampaigns(businessId);
    const creatives = await advertisingRepository.findCreatives(businessId, campaigns.flatMap(({ data }) => data.creativeIds));
    const entry = { at: Date.now(), campaigns, creatives };
    campaignCache.set(businessId, entry);
    return entry;
  }

  /** What this machine may play (§ PLAYLIST). Empty when the machine's design turns ads off. */
  async playlistForMachine(businessId: string, machineId: string, machine: Machine, adsEnabled: boolean, now = new Date()): Promise<MachinePlaylist> {
    if (!adsEnabled) return { version: 'off', campaigns: [] };
    const { campaigns, creatives } = await this.activeCampaigns(businessId);
    return buildMachinePlaylist(campaigns, creatives, { id: machineId, locationId: machine.locationId, ownerPartnerId: machine.ownerPartnerId }, now);
  }

  // ── Playback ──────────────────────────────────────────────────────────
  /**
   * A machine's batch of playback events (§ PLAYBACK EVENTS). Each event
   * is checked on its own; a bad one is reported back and never stops the
   * rest. A resent batch (same machine, same `batchId`) counts once, ever;
   * the machine keeps an unacknowledged batch with its id until the server
   * confirms it, and never puts an event in two batches.
   */
  async recordPlayback(businessId: string, machineId: string, input: unknown, now = new Date()) {
    const body = (input ?? {}) as Record<string, unknown>;
    if (typeof body.batchId !== 'string' || !CLIENT_EVENT_ID.test(body.batchId)) throw new AdValidationError('Send a batchId (8–64 letters, digits, - or _) and resend the same one on retry.');
    if (!Array.isArray(body.events)) throw new AdValidationError('Send { batchId, events: [...] }.');
    if (body.events.length > AD_LIMITS.eventsPerBatch) throw new AdValidationError(`Send at most ${AD_LIMITS.eventsPerBatch} events at a time.`);
    const packageVersion = typeof body.packageVersion === 'string' ? body.packageVersion.slice(0, 64) : null;
    const campaignIds = [...new Set(body.events.map((event) => (event as Record<string, unknown>)?.campaignId).filter((id): id is string => typeof id === 'string'))];
    const known = new Map<string, AdCampaign>();
    for (const campaignId of campaignIds) {
      const campaign = await advertisingRepository.findCampaign(businessId, campaignId);
      if (campaign) known.set(campaignId, campaign);
    }
    const valid: NewPlaybackEvent[] = [];
    const rejected: { index: number; reason: string }[] = [];
    body.events.forEach((raw, index) => {
      const event = (raw ?? {}) as Record<string, unknown>;
      const campaign = typeof event.campaignId === 'string' ? known.get(event.campaignId) : undefined;
      const occurredAt = typeof event.occurredAt === 'string' ? new Date(event.occurredAt) : null;
      if (typeof event.clientEventId !== 'string' || !CLIENT_EVENT_ID.test(event.clientEventId)) return void rejected.push({ index, reason: 'clientEventId must be 8–64 letters, digits, - or _' });
      if (!(AD_PLAYBACK_EVENT_TYPES as readonly string[]).includes(event.eventType as string)) return void rejected.push({ index, reason: 'unknown eventType' });
      if (!campaign) return void rejected.push({ index, reason: 'unknown campaign' });
      if (typeof event.creativeId !== 'string' || !campaign.creativeIds.includes(event.creativeId)) return void rejected.push({ index, reason: 'creative is not part of this campaign' });
      if (!occurredAt || Number.isNaN(occurredAt.getTime())) return void rejected.push({ index, reason: 'occurredAt must be an ISO time' });
      const playedMs = event.playedMs === undefined || event.playedMs === null ? null : Number(event.playedMs);
      if (playedMs !== null && (!Number.isInteger(playedMs) || playedMs < 0 || playedMs > 10 * 60 * 1000)) return void rejected.push({ index, reason: 'playedMs out of range' });
      valid.push({
        campaignId: event.campaignId as string,
        creativeId: event.creativeId,
        eventType: event.eventType as AdPlaybackEventType,
        clientEventId: event.clientEventId,
        occurredAt,
        playedMs,
        failureReason: typeof event.failureReason === 'string' ? event.failureReason.slice(0, 200) : null,
      });
    });
    const { accepted, duplicates, duplicateBatch } = await advertisingRepository.recordBatch(businessId, machineId, body.batchId, nairobiClock(now).date, packageVersion, valid);
    return { accepted, duplicates, duplicateBatch, rejected };
  }

  // ── Statistics ────────────────────────────────────────────────────────
  async campaignStats(businessId: string, fromDate: string, toDate: string) {
    const rows = await advertisingRepository.listStats(businessId, fromDate, toDate);
    const byCampaign = new Map<string, { started: number; completed: number; failed: number; interacted: number; playedMs: number; machines: Set<string> }>();
    for (const row of rows) {
      const entry = byCampaign.get(row.campaignId) ?? { started: 0, completed: 0, failed: 0, interacted: 0, playedMs: 0, machines: new Set<string>() };
      entry.started += row.started ?? 0;
      entry.completed += row.completed ?? 0;
      entry.failed += row.failed ?? 0;
      entry.interacted += row.interacted ?? 0;
      entry.playedMs += row.playedMs ?? 0;
      if ((row.started ?? 0) > 0) entry.machines.add(row.machineId);
      byCampaign.set(row.campaignId, entry);
    }
    return [...byCampaign.entries()].map(([campaignId, entry]) => ({
      campaignId,
      started: entry.started,
      completed: entry.completed,
      failed: entry.failed,
      interacted: entry.interacted,
      playedHours: round2(entry.playedMs / 3_600_000),
      machines: entry.machines.size,
      completionRate: entry.started > 0 ? entry.completed / entry.started : null,
      /** Taps on the screen during or just after an ad, per completed play. Not a sale, and not proof the ad caused anything. */
      interactionRate: entry.completed > 0 ? entry.interacted / entry.completed : null,
    }));
  }

  // ── Revenue ───────────────────────────────────────────────────────────
  /**
   * What each campaign earned in `month` under its own price terms, and
   * each owner's share (§ AD REVENUE, § OWNER AD REVENUE SHARE):
   *
   * - per completed play: completed plays × price;
   * - per machine-day: (machine, day) pairs with a completed play × price;
   * - flat monthly: the price, for a month with at least one completed play;
   * - not billed: nothing.
   *
   * A campaign's earnings are attributed to machines by their share of its
   * completed plays that month (per machine-day: by their machine-days),
   * and each owner receives their agreement's `adRevenueSharePartnerPct`
   * of what their machines earned. Owner shares default to 0% (see
   * docs/OS_MASTER_GAP_ANALYSIS.md §4). Entries are recomputable estimates
   * of earnings, not invoices, and are never mixed into product margin.
   */
  async computeRevenueForMonth(businessId: string, month: string, actor: string): Promise<AdRevenueEntry[]> {
    if (!MONTH.test(month)) throw new AdValidationError('Month is YYYY-MM.');
    const [year, mon] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const stats = await advertisingRepository.listStats(businessId, `${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`);
    const byCampaign = new Map<string, AdDailyStat[]>();
    for (const row of stats) byCampaign.set(row.campaignId, [...(byCampaign.get(row.campaignId) ?? []), row]);
    const profiles = new Map<string, Awaited<ReturnType<typeof machineEconomicProfileService.resolve>> | null>();
    const profileOf = async (machineId: string) => {
      if (!profiles.has(machineId)) {
        profiles.set(machineId, await machineEconomicProfileService.resolve(businessId, machineId).catch(() => null));
      }
      return profiles.get(machineId) ?? null;
    };

    const entries: AdRevenueEntry[] = [];
    for (const [campaignId, rows] of byCampaign) {
      const campaign = await advertisingRepository.findCampaign(businessId, campaignId);
      if (!campaign) continue;
      const playsByMachine = new Map<string, number>();
      const daysByMachine = new Map<string, number>();
      for (const row of rows) {
        const completed = row.completed ?? 0;
        if (completed <= 0) continue;
        playsByMachine.set(row.machineId, (playsByMachine.get(row.machineId) ?? 0) + completed);
        daysByMachine.set(row.machineId, (daysByMachine.get(row.machineId) ?? 0) + 1);
      }
      const completedPlays = [...playsByMachine.values()].reduce((sum, n) => sum + n, 0);
      const machineDays = [...daysByMachine.values()].reduce((sum, n) => sum + n, 0);
      const billableUnits = campaign.billingModel === 'per_completed_play' ? completedPlays : campaign.billingModel === 'per_machine_day' ? machineDays : campaign.billingModel === 'flat_monthly' ? (completedPlays > 0 ? 1 : 0) : 0;
      const grossKes = round2(billableUnits * campaign.priceKes);
      const basis = campaign.billingModel === 'per_machine_day' ? daysByMachine : playsByMachine;
      const basisTotal = campaign.billingModel === 'per_machine_day' ? machineDays : completedPlays;

      const owners = new Map<string, AdOwnerShare>();
      for (const [machineId, units] of basis) {
        if (grossKes === 0 || basisTotal === 0) break;
        const profile = await profileOf(machineId);
        if (!profile?.partnerId || !profile.settlesWithOwner) continue;
        const pct = profile.terms.adRevenueSharePartnerPct;
        if (!pct) continue;
        const machineKes = (grossKes * units) / basisTotal;
        const share = owners.get(profile.partnerId) ?? { partnerId: profile.partnerId, machineIds: [], deliveryShare: 0, sharePct: pct, amountKes: 0 };
        share.machineIds.push(machineId);
        share.deliveryShare += units / basisTotal;
        share.amountKes += (machineKes * pct) / 100;
        owners.set(profile.partnerId, share);
      }
      const ownerShares = [...owners.values()].map((share) => ({ ...share, deliveryShare: Math.round(share.deliveryShare * 10_000) / 10_000, amountKes: round2(share.amountKes) }));
      const ownerTotalKes = round2(ownerShares.reduce((sum, share) => sum + share.amountKes, 0));
      const entry: Omit<AdRevenueEntry, 'computedAt'> = {
        businessId,
        campaignId,
        advertiserId: campaign.advertiserId,
        month,
        billingModel: campaign.billingModel,
        unitPriceKes: campaign.priceKes,
        billableUnits,
        grossKes,
        ownerShares,
        ownerTotalKes,
        snackQuestKes: round2(grossKes - ownerTotalKes),
        completedPlays,
        computedBy: actor,
      };
      await advertisingRepository.saveRevenueEntry(businessId, entry);
      entries.push({ ...entry, computedAt: null as unknown as AdRevenueEntry['computedAt'] });
    }
    return entries;
  }

  listRevenue(businessId: string, month: string) {
    if (!MONTH.test(month)) throw new AdValidationError('Month is YYYY-MM.');
    return advertisingRepository.listRevenue(businessId, month);
  }

  /**
   * An owner's advertising view (§ OWNER PORTAL — ADVERTISING): plays on
   * their machines and their computed share for a month. Never shows the
   * advertiser's price or other owners' figures.
   */
  async ownerSummary(businessId: string, partnerId: string, month: string) {
    if (!MONTH.test(month)) throw new AdValidationError('Month is YYYY-MM.');
    const machines = await machineRepository.listByPartner(businessId, partnerId);
    const machineIds = machines.map(({ id }) => id);
    const [year, mon] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const stats = machineIds.length > 0 ? await advertisingRepository.listStatsForMachines(businessId, machineIds, `${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`) : [];
    const revenue = await advertisingRepository.listRevenue(businessId, month);
    const shareKes = round2(revenue.flatMap((entry) => entry.ownerShares).filter((share) => share.partnerId === partnerId).reduce((sum, share) => sum + share.amountKes, 0));
    const profiles = await Promise.all(machineIds.map((id) => machineEconomicProfileService.resolve(businessId, id).catch(() => null)));
    const sharePcts = [...new Set(profiles.map((profile) => profile?.terms.adRevenueSharePartnerPct ?? 0))];
    return {
      month,
      completedPlays: stats.reduce((sum, row) => sum + (row.completed ?? 0), 0),
      interactions: stats.reduce((sum, row) => sum + (row.interacted ?? 0), 0),
      shareKes,
      sharePcts,
      computed: revenue.length > 0,
    };
  }

  /**
   * Advertising revenue attributed to one machine between two instants
   * (§ MACHINE-LEVEL P&L). Each campaign-month's computed revenue is shared
   * out by this machine's part of that month's delivery (completed plays; for
   * per-machine-day billing, days with a play) falling inside the period.
   * Months with plays but no computed revenue are named, never guessed.
   */
  async machineAdRevenue(businessId: string, machineId: string, periodStart: Date, periodEnd: Date): Promise<{ grossKes: number; uncomputedMonths: string[] }> {
    const from = nairobiClock(periodStart).date;
    const to = nairobiClock(new Date(periodEnd.getTime() - 1)).date;
    if (from > to) return { grossKes: 0, uncomputedMonths: [] };
    const stats = await advertisingRepository.listStatsForMachines(businessId, [machineId], from, to);
    const byCampaignMonth = new Map<string, { plays: number; days: number }>();
    for (const row of stats) {
      if ((row.completed ?? 0) <= 0) continue;
      const key = `${row.campaignId}|${row.date.slice(0, 7)}`;
      const entry = byCampaignMonth.get(key) ?? { plays: 0, days: 0 };
      entry.plays += row.completed ?? 0;
      entry.days += 1;
      byCampaignMonth.set(key, entry);
    }
    const revenueByMonth = new Map<string, AdRevenueEntry[]>();
    let grossKes = 0;
    const uncomputed = new Set<string>();
    for (const [key, basis] of byCampaignMonth) {
      const [campaignId, month] = key.split('|');
      if (!revenueByMonth.has(month)) revenueByMonth.set(month, await advertisingRepository.listRevenue(businessId, month));
      const entry = revenueByMonth.get(month)!.find((candidate) => candidate.campaignId === campaignId);
      if (!entry) {
        uncomputed.add(month);
        continue;
      }
      if (entry.grossKes === 0) continue;
      const total = entry.billingModel === 'per_machine_day' || entry.billingModel === 'per_completed_play' ? entry.billableUnits : entry.completedPlays;
      const mine = entry.billingModel === 'per_machine_day' ? basis.days : basis.plays;
      if (total > 0) grossKes += (entry.grossKes * mine) / total;
    }
    return { grossKes: round2(grossKes), uncomputedMonths: [...uncomputed].sort() };
  }

  async assertMachine(businessId: string, machineId: string): Promise<Machine> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    return machine;
  }
}

export const advertisingService = new AdvertisingService();
