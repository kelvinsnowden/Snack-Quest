import { ImageResponse } from 'next/og';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';

export const alt = 'Snack Quest — Snack boxes on WhatsApp';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: 24,
            background: '#ff7a00',
            color: '#ffffff',
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          SQ
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{businessName}</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#756e5f' }}>Snack boxes on WhatsApp, delivered across Kenya</div>
      </div>
    ),
    { ...size },
  );
}
