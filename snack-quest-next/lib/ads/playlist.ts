import type { AdCampaign, AdCreative, AdMediaKind, AdSchedule, AdTargeting } from '@/types/advertising';

/**
 * The idle-screen playlist (§ PLAYLIST, § SCHEDULING, § FREQUENCY CAPS).
 * Pure and shared: the server decides which campaigns a machine may play
 * today (`buildMachinePlaylist`); the machine decides, at each moment,
 * which one plays next (`nextAd`) — so a machine that loses its
 * connection keeps honouring schedules and caps from its cached playlist.
 */

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface NairobiClock {
  date: string;
  dayOfWeek: number;
  minute: number;
}

/** Nairobi has no daylight saving: UTC+3 all year. */
export function nairobiClock(now: Date): NairobiClock {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), dayOfWeek: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function isScheduledAt(schedule: Pick<AdSchedule, 'startDate' | 'endDate' | 'daysOfWeek' | 'startMinute' | 'endMinute'>, clock: NairobiClock): boolean {
  if (clock.date < schedule.startDate) return false;
  if (schedule.endDate !== null && clock.date > schedule.endDate) return false;
  if (!schedule.daysOfWeek.includes(clock.dayOfWeek)) return false;
  return clock.minute >= schedule.startMinute && clock.minute < schedule.endMinute;
}

export function targetsMachine(targeting: AdTargeting, machine: { id: string; locationId: string | null; ownerPartnerId: string | null }): boolean {
  if (targeting.allMachines) return true;
  if (targeting.machineIds.includes(machine.id)) return true;
  if (machine.locationId && targeting.locationIds.includes(machine.locationId)) return true;
  if (machine.ownerPartnerId && targeting.ownerPartnerIds.includes(machine.ownerPartnerId)) return true;
  return false;
}

export interface PlaylistCreative {
  creativeId: string;
  mediaKind: AdMediaKind;
  mimeType: string;
  mediaUrl: string;
  sha256: string;
  bytes: number;
  durationSeconds: number;
}

export interface PlaylistCampaign {
  campaignId: string;
  weight: number;
  frequencyCapPerHour: number | null;
  schedule: AdSchedule;
  creatives: PlaylistCreative[];
}

export interface MachinePlaylist {
  version: string;
  campaigns: PlaylistCampaign[];
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The campaigns one machine may play from today on: active, aimed at this
 * machine, not finished, with at least one approved creative. Time-of-day
 * and weekday are left to `nextAd`, which the machine runs at play time.
 */
export function buildMachinePlaylist(
  campaigns: { id: string; data: AdCampaign }[],
  creatives: Map<string, AdCreative>,
  machine: { id: string; locationId: string | null; ownerPartnerId: string | null },
  now: Date,
): MachinePlaylist {
  const today = nairobiClock(now).date;
  const eligible: PlaylistCampaign[] = [];
  for (const { id, data } of campaigns) {
    if (data.status !== 'active') continue;
    if (data.schedule.endDate !== null && data.schedule.endDate < today) continue;
    if (!targetsMachine(data.targeting, machine)) continue;
    const approved = data.creativeIds
      .map((creativeId) => ({ creativeId, creative: creatives.get(creativeId) }))
      .filter((entry): entry is { creativeId: string; creative: AdCreative } => entry.creative?.status === 'approved' && entry.creative.businessId === data.businessId)
      .map(({ creativeId, creative }) => ({
        creativeId,
        mediaKind: creative.mediaKind,
        mimeType: creative.mimeType,
        mediaUrl: creative.mediaUrl,
        sha256: creative.sha256,
        bytes: creative.bytes,
        durationSeconds: creative.durationSeconds,
      }));
    if (approved.length === 0) continue;
    eligible.push({ campaignId: id, weight: data.weight, frequencyCapPerHour: data.frequencyCapPerHour, schedule: data.schedule, creatives: approved });
  }
  eligible.sort((a, b) => a.campaignId.localeCompare(b.campaignId));
  return { version: `a${hash(JSON.stringify(eligible))}`, campaigns: eligible };
}

/** What the machine remembers between plays: recent plays (for caps) and the rotation counters. */
export interface RotationState {
  /** Smooth weighted round-robin credit per campaign. */
  credit: Record<string, number>;
  /** Next creative to show per campaign. */
  creativeIndex: Record<string, number>;
  /** Start times (ms) of recent plays per campaign, pruned to the last hour. */
  recent: Record<string, number[]>;
}

export const EMPTY_ROTATION: RotationState = { credit: {}, creativeIndex: {}, recent: {} };

/**
 * Picks the next ad, or null when nothing may play now. Eligible: in
 * schedule at `now` (Nairobi) and under its hourly cap. Among those, smooth
 * weighted round-robin: a weight-3 campaign plays three times as often as
 * a weight-1, interleaved rather than in runs, and deterministically.
 * Returns the state to keep; the caller records the play by passing the
 * returned state back next time.
 */
export function nextAd(playlist: MachinePlaylist, now: Date, state: RotationState = EMPTY_ROTATION): { campaign: PlaylistCampaign; creative: PlaylistCreative; state: RotationState } | null {
  const clock = nairobiClock(now);
  const nowMs = now.getTime();
  const recent: Record<string, number[]> = {};
  for (const [campaignId, times] of Object.entries(state.recent)) {
    const kept = times.filter((at) => nowMs - at < HOUR_MS);
    if (kept.length > 0) recent[campaignId] = kept;
  }
  const eligible = playlist.campaigns.filter(
    (campaign) => campaign.creatives.length > 0 && isScheduledAt(campaign.schedule, clock) && (campaign.frequencyCapPerHour === null || (recent[campaign.campaignId]?.length ?? 0) < campaign.frequencyCapPerHour),
  );
  if (eligible.length === 0) return null;

  const credit = { ...state.credit };
  const total = eligible.reduce((sum, campaign) => sum + campaign.weight, 0);
  let chosen = eligible[0];
  for (const campaign of eligible) {
    credit[campaign.campaignId] = (credit[campaign.campaignId] ?? 0) + campaign.weight;
    if (credit[campaign.campaignId] > (credit[chosen.campaignId] ?? 0)) chosen = campaign;
  }
  credit[chosen.campaignId] -= total;
  // Campaigns no longer eligible lose their credit, so one returning later can't burst.
  for (const key of Object.keys(credit)) if (!eligible.some((campaign) => campaign.campaignId === key)) delete credit[key];

  const index = (state.creativeIndex[chosen.campaignId] ?? 0) % chosen.creatives.length;
  return {
    campaign: chosen,
    creative: chosen.creatives[index],
    state: {
      credit,
      creativeIndex: { ...state.creativeIndex, [chosen.campaignId]: index + 1 },
      recent: { ...recent, [chosen.campaignId]: [...(recent[chosen.campaignId] ?? []), nowMs] },
    },
  };
}
