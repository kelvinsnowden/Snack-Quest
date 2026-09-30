import { describe, expect, it } from 'vitest';
import { buildMachinePlaylist, isScheduledAt, nairobiClock, nextAd, targetsMachine, EMPTY_ROTATION, type MachinePlaylist, type RotationState } from '@/lib/ads/playlist';
import type { AdCampaign, AdCreative } from '@/types/advertising';

/** The idle-screen playlist (§ PLAYLIST, § SCHEDULING, § FREQUENCY CAPS) — pure, shared by server and machine. */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// 2026-09-30 is a Wednesday. 09:00 UTC = 12:00 Nairobi.
const NOON = new Date('2026-09-30T09:00:00Z');

function campaign(overrides: Partial<AdCampaign> = {}): AdCampaign {
  return {
    businessId: 'biz',
    advertiserId: 'adv',
    advertiserKind: 'external',
    name: 'C',
    status: 'active',
    creativeIds: ['cr1'],
    schedule: { startDate: '2026-09-01', endDate: null, daysOfWeek: ALL_DAYS, startMinute: 0, endMinute: 1440 },
    targeting: { allMachines: true, machineIds: [], locationIds: [], ownerPartnerIds: [] },
    weight: 1,
    frequencyCapPerHour: null,
    billingModel: 'none',
    priceKes: 0,
    createdBy: 's',
    publishedBy: 's',
    publishedAt: null as unknown as AdCampaign['publishedAt'],
    createdAt: null as unknown as AdCampaign['createdAt'],
    updatedAt: null as unknown as AdCampaign['updatedAt'],
    ...overrides,
  };
}

function creative(status: AdCreative['status'] = 'approved', businessId = 'biz'): AdCreative {
  return { businessId, advertiserId: 'adv', name: 'x', mimeType: 'image/png', mediaKind: 'image', mediaUrl: 'https://blob.example/x.png', bytes: 100, sha256: 'a'.repeat(64), durationSeconds: 8, status, reviewedBy: null, reviewedAt: null, reviewNote: null, createdBy: 's', createdAt: null as never, updatedAt: null as never };
}

const MACHINE = { id: 'm1', locationId: 'loc1', ownerPartnerId: 'p1' };

describe('clock and schedule', () => {
  it('Nairobi is UTC+3: late UTC evening is already tomorrow', () => {
    expect(nairobiClock(new Date('2026-09-30T22:30:00Z'))).toEqual({ date: '2026-10-01', dayOfWeek: 4, minute: 90 });
  });

  it('the daily window includes its start and excludes its end', () => {
    const schedule = { startDate: '2026-09-01', endDate: '2026-09-30', daysOfWeek: [3], startMinute: 720, endMinute: 780 };
    expect(isScheduledAt(schedule, { date: '2026-09-30', dayOfWeek: 3, minute: 720 })).toBe(true);
    expect(isScheduledAt(schedule, { date: '2026-09-30', dayOfWeek: 3, minute: 780 })).toBe(false);
    expect(isScheduledAt(schedule, { date: '2026-09-30', dayOfWeek: 4, minute: 730 })).toBe(false);
    expect(isScheduledAt(schedule, { date: '2026-10-01', dayOfWeek: 3, minute: 730 })).toBe(false);
  });

  it('targets by machine, location or owner', () => {
    const none = { allMachines: false, machineIds: [], locationIds: [], ownerPartnerIds: [] };
    expect(targetsMachine(none, MACHINE)).toBe(false);
    expect(targetsMachine({ ...none, locationIds: ['loc1'] }, MACHINE)).toBe(true);
    expect(targetsMachine({ ...none, ownerPartnerIds: ['p1'] }, MACHINE)).toBe(true);
    expect(targetsMachine({ ...none, ownerPartnerIds: ['p1'] }, { ...MACHINE, ownerPartnerId: null })).toBe(false);
  });
});

describe('buildMachinePlaylist', () => {
  it('keeps only active, current, targeted campaigns with an approved creative of the same business', () => {
    const creatives = new Map([
      ['cr1', creative()],
      ['pending', creative('pending_review')],
      ['foreign', creative('approved', 'other-biz')],
    ]);
    const playlist = buildMachinePlaylist(
      [
        { id: 'ok', data: campaign() },
        { id: 'paused', data: campaign({ status: 'paused' }) },
        { id: 'over', data: campaign({ schedule: { ...campaign().schedule, endDate: '2026-09-29' } }) },
        { id: 'elsewhere', data: campaign({ targeting: { allMachines: false, machineIds: ['m9'], locationIds: [], ownerPartnerIds: [] } }) },
        { id: 'unapproved', data: campaign({ creativeIds: ['pending'] }) },
        { id: 'foreign', data: campaign({ creativeIds: ['foreign'] }) },
      ],
      creatives,
      MACHINE,
      NOON,
    );
    expect(playlist.campaigns.map((c) => c.campaignId)).toEqual(['ok']);
    expect(playlist.campaigns[0].creatives[0]).toMatchObject({ sha256: 'a'.repeat(64), mediaUrl: 'https://blob.example/x.png' });
  });

  it('the version changes only when the playlist does', () => {
    const creatives = new Map([['cr1', creative()]]);
    const a = buildMachinePlaylist([{ id: 'ok', data: campaign() }], creatives, MACHINE, NOON);
    expect(buildMachinePlaylist([{ id: 'ok', data: campaign() }], creatives, MACHINE, NOON).version).toBe(a.version);
    expect(buildMachinePlaylist([{ id: 'ok', data: campaign({ weight: 2 }) }], creatives, MACHINE, NOON).version).not.toBe(a.version);
  });
});

describe('nextAd', () => {
  function playlist(...entries: { id: string; weight?: number; cap?: number | null; startMinute?: number; endMinute?: number; creatives?: number }[]): MachinePlaylist {
    return {
      version: 'v',
      campaigns: entries.map((entry) => ({
        campaignId: entry.id,
        weight: entry.weight ?? 1,
        frequencyCapPerHour: entry.cap ?? null,
        schedule: { startDate: '2026-01-01', endDate: null, daysOfWeek: ALL_DAYS, startMinute: entry.startMinute ?? 0, endMinute: entry.endMinute ?? 1440 },
        creatives: Array.from({ length: entry.creatives ?? 1 }, (_, i) => ({ creativeId: `${entry.id}-${i}`, mediaKind: 'image' as const, mimeType: 'image/png', mediaUrl: 'https://x', sha256: 'x', bytes: 1, durationSeconds: 8 })),
      })),
    };
  }

  function run(list: MachinePlaylist, plays: number, stepMs = 60_000) {
    let state: RotationState = EMPTY_ROTATION;
    const picks: string[] = [];
    for (let i = 0; i < plays; i += 1) {
      const next = nextAd(list, new Date(NOON.getTime() + i * stepMs), state);
      if (!next) {
        picks.push('-');
        continue;
      }
      picks.push(next.campaign.campaignId);
      state = next.state;
    }
    return { picks, state };
  }

  it('weights set the share, interleaved rather than in runs', () => {
    const { picks } = run(playlist({ id: 'A', weight: 3 }, { id: 'B', weight: 1 }), 8);
    expect(picks.filter((p) => p === 'A')).toHaveLength(6);
    expect(picks.filter((p) => p === 'B')).toHaveLength(2);
    expect(picks.join('')).not.toMatch(/AAAA/);
  });

  it('is deterministic', () => {
    const list = playlist({ id: 'A', weight: 2 }, { id: 'B', weight: 3 }, { id: 'C', weight: 1 });
    expect(run(list, 12).picks).toEqual(run(list, 12).picks);
  });

  it('respects the hourly cap, then plays again once an hour has passed', () => {
    const list = playlist({ id: 'A', cap: 2 });
    expect(run(list, 4, 60_000).picks).toEqual(['A', 'A', '-', '-']);
    expect(run(list, 3, 31 * 60_000).picks).toEqual(['A', 'A', 'A']);
  });

  it('plays nothing outside the daily window', () => {
    expect(nextAd(playlist({ id: 'A', startMinute: 18 * 60, endMinute: 22 * 60 }), NOON)).toBeNull();
  });

  it('rotates a campaign’s creatives in turn', () => {
    const list = playlist({ id: 'A', creatives: 3 });
    let state = EMPTY_ROTATION;
    const shown: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const next = nextAd(list, NOON, state)!;
      shown.push(next.creative.creativeId);
      state = next.state;
    }
    expect(shown).toEqual(['A-0', 'A-1', 'A-2', 'A-0']);
  });
});
