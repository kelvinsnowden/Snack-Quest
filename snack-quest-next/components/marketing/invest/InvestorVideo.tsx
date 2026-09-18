'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Play, ArrowDown } from 'lucide-react';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { INVESTOR_EVENTS } from '@/lib/analytics/investorEvents';
import { INVESTOR_VIDEO_URL, INVESTOR_VIDEO_POSTER } from '@/lib/invest/raise';
import { resolveVideoSource } from '@/lib/invest/videoSource';

/**
 * The founder's recorded presentation, at the top of the page
 * (§ investor interest page).
 *
 * Three states, and the third is the one that matters most today: the
 * URL is set to a file, set to an embed, or not set at all. An unset
 * URL renders a designed waiting state rather than an empty black
 * rectangle or — worse — a player pointed at nothing, which is what a
 * naïve `<video src="">` gives you. The page has to be shippable
 * before the video is uploaded, because it will be shared the moment
 * it exists.
 *
 * Never autoplays. A page that starts talking at somebody who opened
 * it from a WhatsApp link, possibly in a room with other people, is a
 * page they close. Click to play, always, sound and all.
 */
export function InvestorVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  /*
   * Whatever link was pasted, normalised to one that can actually be
   * played — a Google Drive or YouTube *share* URL cannot be framed as
   * given, and fails as a blank rectangle rather than an error. See
   * `resolveVideoSource`.
   */
  const source = resolveVideoSource(INVESTOR_VIDEO_URL);

  if (source.kind === 'none') {
    return <VideoPending />;
  }

  if (source.kind === 'embed') {
    /*
     * An embed. We cannot observe playback inside a cross-origin
     * iframe without pulling in the provider's SDK, so `videoPlayed`
     * fires on the first interaction with the frame and completion is
     * simply not reported — an absent metric being better than a
     * fabricated one.
     */
    return (
      <figure className="relative w-full overflow-hidden rounded-2xl bg-black shadow-[0_40px_120px_-30px_rgb(0_0_0/0.85)] sm:rounded-3xl">
        <div className="aspect-video w-full">
          <iframe
            src={source.url}
            title="Snack Quest — the founder's presentation"
            className="size-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            onLoad={() => trackEvent(INVESTOR_EVENTS.videoPlayed, { kind: source.provider })}
          />
        </div>
      </figure>
    );
  }

  return (
    <figure className="relative w-full overflow-hidden rounded-2xl bg-black shadow-[0_40px_120px_-30px_rgb(0_0_0/0.85)] sm:rounded-3xl">
      <video
        ref={videoRef}
        className="aspect-video w-full"
        controls
        preload="metadata"
        playsInline
        poster={INVESTOR_VIDEO_POSTER}
        onPlay={() => {
          // Once per visit, not once per resume: somebody who pauses
          // to take a call has not started watching twice.
          if (started) return;
          setStarted(true);
          trackEvent(INVESTOR_EVENTS.videoPlayed, { kind: 'file' });
        }}
        onEnded={() => trackEvent(INVESTOR_EVENTS.videoCompleted)}
      >
        <source src={source.url} />
        Your browser can’t play this video. The written story is directly below.
      </video>
    </figure>
  );
}

/**
 * Before the recording is published.
 *
 * Shows a real frame — the founder with a box — rather than a grey
 * placeholder, says plainly that the video is coming, and puts the
 * written route one tap away. Nothing here pretends to be a player: a
 * fake play button that does nothing is worse than no play button.
 */
function VideoPending() {
  return (
    <figure className="relative w-full overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_rgb(0_0_0/0.85)] sm:rounded-3xl">
      <div className="relative aspect-video w-full">
        <Image
          src={INVESTOR_VIDEO_POSTER}
          alt="Kelvin Kimathi, founder of Snack Quest, with a packed Snack Quest box."
          fill
          sizes="(min-width: 1200px) 1100px, 100vw"
          className="object-cover object-[center_28%]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#120c22] via-[#120c22]/70 to-[#120c22]/20" />
        <figcaption className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-5 text-center sm:gap-4 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white/90 uppercase backdrop-blur sm:text-xs">
            <Play className="size-3.5" aria-hidden="true" />
            Presentation coming shortly
          </span>
          <p className="max-w-lg text-sm text-white/85 sm:text-base">
            Kelvin’s recorded walkthrough is being published here. The full written story is
            below — it covers everything the video does.
          </p>
          <a
            href="#opportunity"
            onClick={() => trackEvent(INVESTOR_EVENTS.readInstead, { from: 'video_pending' })}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#120c22] transition-transform hover:-translate-y-0.5"
          >
            Read the story
            <ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </figcaption>
      </div>
    </figure>
  );
}

/**
 * The reader's escape hatch, under the player.
 *
 * One of the four people this page is built for prefers not to watch
 * anything, and a video at the top with no alternative tells them the
 * page is not for them.
 */
export function PreferReading() {
  return (
    <p className="mt-6 text-center text-sm text-white/70 sm:text-base">
      Prefer reading?{' '}
      <a
        href="#opportunity"
        onClick={() => trackEvent(INVESTOR_EVENTS.readInstead, { from: 'under_video' })}
        className="decoration-primary/60 hover:decoration-primary font-semibold text-white underline decoration-2 underline-offset-4"
      >
        Read the story ↓
      </a>
    </p>
  );
}
