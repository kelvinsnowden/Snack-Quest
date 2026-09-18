/**
 * Turns whatever video link is to hand into something that actually
 * plays (§ investor interest page).
 *
 * This exists because the URL a person copies is almost never the URL
 * a browser can embed, and the failure is silent. Every one of these
 * is a link somebody would reasonably paste into
 * `INVESTOR_VIDEO_URL`, and every one of them renders a blank grey
 * rectangle if passed straight to an iframe:
 *
 *   - `drive.google.com/file/d/ID/view?usp=sharing` — the Share button
 *     gives you this, and Google refuses to let it be framed.
 *   - `youtube.com/watch?v=ID` — likewise refused; YouTube only frames
 *     `/embed/`.
 *   - `youtu.be/ID`, `youtube.com/shorts/ID` — same again.
 *   - `vimeo.com/123456` — the page, not the player.
 *
 * A blank player on the page an investor was sent is the worst
 * possible time to discover that, so the mapping happens here rather
 * than in someone's memory.
 *
 * Returns `file` only for something a real `<video>` element can load,
 * because that is the one case where playback and completion can
 * actually be observed. Everything else is an `embed` we can only
 * frame.
 */
export type VideoSource =
  | { kind: 'none' }
  | { kind: 'file'; url: string }
  | { kind: 'embed'; url: string; provider: 'youtube' | 'vimeo' | 'drive' | 'other' };

/** A URL a `<video>` can load directly: our own Blob storage, a CDN, anything ending in a media file. */
function isDirectFile(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

const YOUTUBE_ID = /^[\w-]{6,20}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }
  const watch = url.searchParams.get('v');
  if (watch && YOUTUBE_ID.test(watch)) {
    return watch;
  }
  // `/embed/ID`, `/shorts/ID`, `/live/ID` all carry the id in the same slot.
  const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,20})/);
  return match ? match[1] : null;
}

function driveId(url: URL): string | null {
  if (!url.hostname.replace(/^www\./, '').startsWith('drive.google.com')) {
    return null;
  }
  // `/file/d/ID/view`, `/file/d/ID/preview`, and the older `?id=` forms.
  const path = url.pathname.match(/\/file\/d\/([\w-]{10,})/);
  if (path) {
    return path[1];
  }
  const query = url.searchParams.get('id');
  return query && /^[\w-]{10,}$/.test(query) ? query : null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') {
    return null;
  }
  const match = url.pathname.match(/(?:\/video)?\/(\d{6,})/);
  return match ? match[1] : null;
}

export function resolveVideoSource(raw: string): VideoSource {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: 'none' };
  }

  // A direct file wins before any host matching: a `.mp4` sitting in
  // Blob storage is a file whoever is hosting it.
  if (isDirectFile(trimmed)) {
    return { kind: 'file', url: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a URL at all. Treated as unset rather than thrown, because a
    // typo in a config constant must not take down the whole page.
    return { kind: 'none' };
  }

  /*
   * Only the two schemes a video can arrive over.
   *
   * `new URL` is far more permissive than it looks — `htps:/typo` and
   * `javascript:alert(1)` both parse cleanly — and whatever comes back
   * here goes straight into an iframe `src`. A mistyped scheme should
   * show the waiting state, and a `javascript:` URL must never be
   * framed at all, however unlikely it is to reach a constant in this
   * repo. Cheap, and the alternative is a hole that only needs one
   * future refactor to point this at something a user supplies.
   */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'none' };
  }

  const youtube = youtubeId(url);
  if (youtube) {
    /*
     * `youtube-nocookie.com`, which serves the same player without
     * setting tracking cookies until someone actually presses play.
     * The page is shared into WhatsApp and read by strangers; there is
     * no reason for it to drop advertising cookies on them.
     */
    return { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${youtube}`, provider: 'youtube' };
  }

  const drive = driveId(url);
  if (drive) {
    return { kind: 'embed', url: `https://drive.google.com/file/d/${drive}/preview`, provider: 'drive' };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return { kind: 'embed', url: `https://player.vimeo.com/video/${vimeo}`, provider: 'vimeo' };
  }

  /*
   * Something else entirely — a self-hosted player, a provider we have
   * not met. Framed as given, on the assumption that whoever pasted an
   * unusual URL knew what they were doing, which is a better default
   * than refusing to show their video.
   */
  return { kind: 'embed', url: trimmed, provider: 'other' };
}
