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

export default async function Image() {
  const [business, logoBuffer] = await Promise.all([
    getCurrentBusiness(),
    readFile(path.join(process.cwd(), 'public', 'logo.png')),
  ]);
  const businessName = business?.name ?? 'Snack Quest';
  const logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;

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
        <img
          src={logoDataUrl}
          alt=""
          width={88}
          height={88}
          style={{ borderRadius: 24 }}
        />
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{businessName}</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#756e5f' }}>Mystery snack boxes, delivered across Kenya</div>
      </div>
    ),
    { ...size },
  );
}
