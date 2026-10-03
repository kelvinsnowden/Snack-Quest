import type { MachinePlaylist, PlaylistCampaign, PlaylistCreative } from '@/lib/ads/playlist';

const MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The ad playlist from a content package or the screen's cache, re-checked
 * on the screen (§ CONTENT SYNC, § AD SECURITY): only https files of the
 * allowed types with a SHA-256 to verify against, sane durations and
 * schedules. Anything else is dropped — never played.
 */
export function parsePlaylist(value: unknown): MachinePlaylist {
  const source = (value ?? {}) as { version?: unknown; campaigns?: unknown };
  if (!Array.isArray(source.campaigns)) return { version: 'none', campaigns: [] };
  const campaigns: PlaylistCampaign[] = [];
  for (const raw of source.campaigns as Record<string, unknown>[]) {
    if (!raw || typeof raw.campaignId !== 'string') continue;
    const schedule = raw.schedule as Record<string, unknown> | undefined;
    if (!schedule || typeof schedule.startDate !== 'string' || !DATE.test(schedule.startDate) || !(schedule.endDate === null || (typeof schedule.endDate === 'string' && DATE.test(schedule.endDate)))) continue;
    if (!Array.isArray(schedule.daysOfWeek) || typeof schedule.startMinute !== 'number' || typeof schedule.endMinute !== 'number') continue;
    const weight = Number(raw.weight);
    if (!Number.isInteger(weight) || weight < 1 || weight > 10) continue;
    const cap = raw.frequencyCapPerHour === null ? null : Number(raw.frequencyCapPerHour);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) continue;
    const creatives: PlaylistCreative[] = [];
    for (const c of Array.isArray(raw.creatives) ? (raw.creatives as Record<string, unknown>[]) : []) {
      if (!c || typeof c.creativeId !== 'string' || typeof c.mediaUrl !== 'string' || !c.mediaUrl.startsWith('https://')) continue;
      if (typeof c.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(c.sha256) || typeof c.mimeType !== 'string' || !MIME.includes(c.mimeType)) continue;
      const seconds = Number(c.durationSeconds);
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) continue;
      creatives.push({ creativeId: c.creativeId, mediaKind: c.mimeType.startsWith('video/') ? 'video' : 'image', mimeType: c.mimeType, mediaUrl: c.mediaUrl, sha256: c.sha256, bytes: Number(c.bytes) || 0, durationSeconds: seconds });
    }
    if (creatives.length === 0) continue;
    campaigns.push({
      campaignId: raw.campaignId,
      weight,
      frequencyCapPerHour: cap,
      schedule: { startDate: schedule.startDate, endDate: schedule.endDate as string | null, daysOfWeek: (schedule.daysOfWeek as unknown[]).filter((d): d is number => Number.isInteger(d)), startMinute: schedule.startMinute, endMinute: schedule.endMinute },
      creatives,
    });
  }
  return { version: typeof source.version === 'string' ? source.version : 'none', campaigns };
}
