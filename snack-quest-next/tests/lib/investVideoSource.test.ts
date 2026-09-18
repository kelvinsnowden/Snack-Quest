import { describe, expect, it } from 'vitest';
import { resolveVideoSource } from '@/lib/invest/videoSource';

/**
 * The link somebody actually copies, versus the link a browser can
 * play (§ investor interest page).
 *
 * Every case below is a URL a person would reasonably paste into
 * `INVESTOR_VIDEO_URL`, and the ones marked as share links all fail
 * *silently* if framed as given — Google and YouTube refuse to be
 * embedded from those paths, so the page renders a blank rectangle
 * with no error anywhere. On the page an investor was just sent, that
 * is the worst possible way to find out.
 */

describe('Google Drive', () => {
  /* Exactly what the Share button puts on the clipboard. */
  it('turns a share link into the embeddable preview', () => {
    expect(
      resolveVideoSource('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view?usp=sharing'),
    ).toEqual({
      kind: 'embed',
      url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/preview',
      provider: 'drive',
    });
  });

  it('accepts a link that is already a preview', () => {
    const source = resolveVideoSource(
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/preview',
    );
    expect(source).toMatchObject({ provider: 'drive' });
    expect(source.kind === 'embed' && source.url).toContain('/preview');
  });

  it('handles the older ?id= forms', () => {
    for (const url of [
      'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrS',
      'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrS',
    ]) {
      expect(resolveVideoSource(url)).toMatchObject({
        url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/preview',
      });
    }
  });
});

describe('YouTube', () => {
  const expected = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

  it.each([
    ['a watch link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['a short link', 'https://youtu.be/dQw4w9WgXcQ'],
    ['a shorts link', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['a mobile link', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['an embed link', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
  ])('embeds %s', (_label, url) => {
    expect(resolveVideoSource(url)).toEqual({ kind: 'embed', url: expected, provider: 'youtube' });
  });

  /*
   * The no-cookie host, not youtube.com. This page is shared into
   * WhatsApp and opened by strangers; it should not drop advertising
   * cookies on them before anyone presses play.
   */
  it('uses the privacy-preserving player host', () => {
    const source = resolveVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(source.kind === 'embed' && source.url).toContain('youtube-nocookie.com');
  });

  it('keeps extra query parameters out of the embed', () => {
    expect(
      resolveVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=share'),
    ).toMatchObject({ url: expected });
  });
});

describe('Vimeo', () => {
  it('turns a page link into the player', () => {
    expect(resolveVideoSource('https://vimeo.com/123456789')).toEqual({
      kind: 'embed',
      url: 'https://player.vimeo.com/video/123456789',
      provider: 'vimeo',
    });
  });
});

describe('a file we can drive ourselves', () => {
  /*
   * The only case that gets a real `<video>`, which is the only case
   * where play and completion can actually be observed — inside a
   * cross-origin iframe they cannot.
   */
  it('recognises a Vercel Blob upload as a file', () => {
    expect(
      resolveVideoSource('https://abc123.public.blob.vercel-storage.com/marketing/pitch-Xy7.mp4'),
    ).toEqual({
      kind: 'file',
      url: 'https://abc123.public.blob.vercel-storage.com/marketing/pitch-Xy7.mp4',
    });
  });

  it.each(['.mp4', '.webm', '.mov', '.m4v'])('recognises %s', (extension) => {
    expect(resolveVideoSource(`https://cdn.example.com/talk${extension}`).kind).toBe('file');
  });

  it('still recognises a file carrying a query string', () => {
    expect(resolveVideoSource('https://cdn.example.com/talk.mp4?v=2').kind).toBe('file');
  });

  /* A relative path, for a file committed to `public/`. */
  it('recognises a path in our own public folder', () => {
    expect(resolveVideoSource('/invest/presentation.mp4')).toEqual({
      kind: 'file',
      url: '/invest/presentation.mp4',
    });
  });
});

describe('when there is nothing to play', () => {
  it.each(['', '   '])('reports none for %p', (value) => {
    expect(resolveVideoSource(value)).toEqual({ kind: 'none' });
  });

  /*
   * A typo must not throw. This runs during render of a page that is
   * otherwise perfectly readable — losing the whole page over a
   * malformed constant would be a far worse outcome than losing the
   * player.
   */
  it('treats a malformed URL as unset rather than throwing', () => {
    expect(() => resolveVideoSource('htps:/not a url')).not.toThrow();
    expect(resolveVideoSource('htps:/not a url')).toEqual({ kind: 'none' });
  });

  /*
   * `new URL` accepts far more than it looks — a mistyped scheme and a
   * `javascript:` URL both parse cleanly, and whatever comes back here
   * goes straight into an iframe `src`. Only http(s) may be framed.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd'])(
    'refuses to frame %p',
    (value) => {
      expect(resolveVideoSource(value)).toEqual({ kind: 'none' });
    },
  );

  /* Something we do not recognise is framed as given rather than refused. */
  it('frames an unknown provider as-is', () => {
    expect(resolveVideoSource('https://player.example.com/embed/abc')).toEqual({
      kind: 'embed',
      url: 'https://player.example.com/embed/abc',
      provider: 'other',
    });
  });
});
