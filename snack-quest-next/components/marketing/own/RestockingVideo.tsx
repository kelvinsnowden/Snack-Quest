'use client';

import { useEffect, useRef } from 'react';
import { RESTOCKING_POSTER_SRC, RESTOCKING_VIDEO_MP4_SRC, RESTOCKING_VIDEO_WEBM_SRC } from './ownPhotos';

/**
 * The restocking timelapse on `/own`. Muted and looping, it plays only
 * while on screen (nothing downloads until then). With reduced motion
 * it never starts on its own: the poster shows, with controls to play.
 */
export function RestockingVideo({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.controls = true;
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`relative ${className ?? ''}`}>
      <span className="absolute -top-3 -left-3 z-10 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold tracking-[0.1em] text-own-accent-ink uppercase shadow-[var(--sq-shadow-md)]">
        Restocking day
      </span>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[2rem] bg-surface shadow-[var(--sq-shadow-lg)] sm:max-w-[340px]">
        <video
          ref={videoRef}
          poster={RESTOCKING_POSTER_SRC}
          muted
          loop
          playsInline
          preload="none"
          aria-label="A snack machine being restocked shelf by shelf until every slot is full."
          className="absolute inset-0 size-full object-cover"
        >
          <source src={RESTOCKING_VIDEO_WEBM_SRC} type="video/webm" />
          <source src={RESTOCKING_VIDEO_MP4_SRC} type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
