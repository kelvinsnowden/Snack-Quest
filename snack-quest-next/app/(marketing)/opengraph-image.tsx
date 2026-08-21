import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';

export const alt = 'Snack Quest, mystery snack boxes delivered across Kenya';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
/**
 * Metadata route files don't inherit `dynamic` from a parent layout
 * (they're separate route handlers, not page segments — same reason
 * app/sitemap.ts sets its own). Without this, Next.js statically
 * prerenders this at build time, which means every build — including
 * Vercel Preview builds without production Firestore credentials —
 * needs real Firebase Admin env vars just to generate an OG image.
 */
export const dynamic = 'force-dynamic';

/**
 * The logo as a data URI, or `null` if it could not be read.
 *
 * Never throws, on purpose. This route's only job is to hand social
 * platforms a picture, and it gets exactly one attempt — a crawler
 * that receives a 500 caches the failure and shows a blank grey card,
 * which is strictly worse than a card with type but no mark. That is
 * not hypothetical: reading this file used to be unguarded, and a
 * missing logo in the deployed bundle blanked every link preview of
 * the site for weeks (see `outputFileTracingIncludes` in
 * next.config.ts, which is the fix for *why* it was missing — this is
 * the guard for it happening again some other way).
 */
async function readLogoDataUrl(): Promise<string | null> {
  try {
    const buffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'));
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('opengraph-image: could not read public/logo.png', error);
    return null;
  }
}

/** Same reasoning as the logo: the tenant lookup is a Firestore round trip, and a preview that says "Snack Quest" beats no preview at all. */
async function readBusinessName(): Promise<string> {
  try {
    return (await getCurrentBusiness())?.name ?? 'Snack Quest';
  } catch (error) {
    console.error('opengraph-image: could not load the current business', error);
    return 'Snack Quest';
  }
}

export default async function Image() {
  const [businessName, logoDataUrl] = await Promise.all([readBusinessName(), readLogoDataUrl()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 24,
          padding: 96,
          background: '#fff8ee',
          color: '#1f1f1f',
          fontFamily: 'sans-serif',
        }}
      >
        {logoDataUrl ? (
          <img
            src={logoDataUrl}
            alt=""
            width={88}
            height={88}
            style={{ borderRadius: 24 }}
          />
        ) : null}
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{businessName}</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#756e5f' }}>Mystery snack boxes, delivered across Kenya</div>
      </div>
    ),
    { ...size },
  );
}
