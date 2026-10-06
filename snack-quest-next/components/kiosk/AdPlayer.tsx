'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_ROTATION, nextAd, type MachinePlaylist, type PlaylistCampaign, type PlaylistCreative, type RotationState } from '@/lib/ads/playlist';
import type { AdPlaybackEventType } from '@/types/advertising';
import { useKioskText } from './kioskTextContext';

export interface AdEvent {
  campaignId: string;
  creativeId: string;
  eventType: AdPlaybackEventType;
  playedMs?: number;
  failureReason?: string;
}

/** A tap within this long after an ad finished still counts as a tap after that ad. */
const POST_AD_WINDOW_MS = 10_000;
/** With nothing allowed to play, look again after this long (a campaign's daily window may open). */
const RETRY_MS = 15_000;

function loadRotation(key: string): RotationState {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RotationState) : EMPTY_ROTATION;
  } catch {
    return EMPTY_ROTATION;
  }
}

/**
 * The idle screen's ads (§ ATTRACT MODE, § PLAYLIST). Plays only creatives
 * whose files were verified against their checksum (`media`), picks each
 * next ad with the shared playlist rules at play time, and reports
 * started / completed / failed / interacted. With nothing to play it shows
 * the normal idle screen. A tap always starts an order — an ad never stands
 * between a customer and the menu.
 */
export function AdPlayer({
  playlist,
  media,
  rotationKey,
  onEvent,
  onTap,
  fallback,
}: {
  playlist: MachinePlaylist;
  media: Record<string, string>;
  rotationKey: string;
  onEvent: (event: AdEvent) => void;
  onTap: () => void;
  /** The normal idle screen, shown when no ad may play; it starts the order itself. */
  fallback: React.ReactNode;
}) {
  const playable = useMemo<MachinePlaylist>(
    () => ({
      version: playlist.version,
      campaigns: playlist.campaigns.map((campaign) => ({ ...campaign, creatives: campaign.creatives.filter((creative) => media[creative.creativeId]) })).filter((campaign) => campaign.creatives.length > 0),
    }),
    [playlist, media],
  );
  const { t } = useKioskText();
  const [current, setCurrent] = useState<{ campaign: PlaylistCampaign; creative: PlaylistCreative; startedAt: number } | null>(null);
  const [tick, setTick] = useState(0);
  const rotationRef = useRef<RotationState | null>(null);
  const lastFinishedRef = useRef<{ campaignId: string; creativeId: string; at: number } | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Pick the next ad whenever the previous one ends (or the playlist changes).
  useEffect(() => {
    if (rotationRef.current === null) rotationRef.current = loadRotation(rotationKey);
    const pick = nextAd(playable, new Date(), rotationRef.current);
    if (!pick) {
      setCurrent(null);
      const retry = setTimeout(() => setTick((n) => n + 1), RETRY_MS);
      return () => clearTimeout(retry);
    }
    rotationRef.current = pick.state;
    try {
      window.localStorage.setItem(rotationKey, JSON.stringify(pick.state));
    } catch {
      // caps then only hold until a reboot
    }
    setCurrent({ campaign: pick.campaign, creative: pick.creative, startedAt: Date.now() });
    onEventRef.current({ campaignId: pick.campaign.campaignId, creativeId: pick.creative.creativeId, eventType: 'started' });
  }, [playable, rotationKey, tick]);

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const finish = useCallback((outcome: 'completed' | 'failed', failureReason?: string) => {
    const playing = currentRef.current;
    if (!playing) return;
    currentRef.current = null;
    onEventRef.current({ campaignId: playing.campaign.campaignId, creativeId: playing.creative.creativeId, eventType: outcome, playedMs: Date.now() - playing.startedAt, failureReason });
    if (outcome === 'completed') lastFinishedRef.current = { campaignId: playing.campaign.campaignId, creativeId: playing.creative.creativeId, at: Date.now() };
    setCurrent(null);
    setTick((n) => n + 1);
  }, []);

  // Images show for their duration; videos end on their own, with a safety net so a stuck video never freezes the screen.
  useEffect(() => {
    if (!current) return;
    const limitMs = current.creative.durationSeconds * 1000 + (current.creative.mediaKind === 'video' ? 5_000 : 0);
    const timer = setTimeout(() => finish(current.creative.mediaKind === 'image' ? 'completed' : 'failed', current.creative.mediaKind === 'video' ? 'did not end in time' : undefined), limitMs);
    return () => clearTimeout(timer);
  }, [current, finish]);

  const recordTapAfterAd = useCallback(() => {
    const recent = lastFinishedRef.current;
    if (recent && Date.now() - recent.at < POST_AD_WINDOW_MS) {
      onEventRef.current({ campaignId: recent.campaignId, creativeId: recent.creativeId, eventType: 'interacted' });
      lastFinishedRef.current = null;
    }
  }, []);

  const handleTap = useCallback(() => {
    const recent = lastFinishedRef.current;
    if (current) {
      onEventRef.current({ campaignId: current.campaign.campaignId, creativeId: current.creative.creativeId, eventType: 'interacted' });
    } else if (recent && Date.now() - recent.at < POST_AD_WINDOW_MS) {
      onEventRef.current({ campaignId: recent.campaignId, creativeId: recent.creativeId, eventType: 'interacted' });
    }
    onTap();
  }, [current, onTap]);

  if (!current) {
    // A tap on the idle screen shortly after an ad counts as a tap after that ad; the idle screen itself starts the order.
    return <div className="contents" onPointerDownCapture={recordTapAfterAd}>{fallback}</div>;
  }
  const src = media[current.creative.creativeId];
  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-kiosk-stage text-kiosk-stage-foreground">
      {current.creative.mediaKind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- a verified ad file from the device cache (a blob: URL).
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <video key={src} src={src} autoPlay muted playsInline className="absolute inset-0 size-full object-cover" onEnded={() => finish('completed')} onError={() => finish('failed', 'video could not play')} />
      )}
      <span className="absolute left-4 top-4 z-10 rounded-full bg-foreground/60 px-3 py-1 text-caption font-semibold text-background">{t('adLabel')}</span>
      <button type="button" onClick={handleTap} className="absolute inset-0 z-20 outline-none" aria-label={t('tapToStartOrder')} />
      <div className="pointer-events-none relative z-10 mt-auto flex justify-center pb-16">
        <span className="rounded-full bg-kiosk-highlight px-10 py-5 text-subtitle font-bold text-kiosk-highlight-foreground shadow-lg">{t('tapToStart')}</span>
      </div>
    </main>
  );
}
