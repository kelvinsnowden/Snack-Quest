import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_NAME = 'Snack Quest';
const SITE_DESCRIPTION = 'Order curated snack boxes on WhatsApp and get them delivered across Kenya.';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: `${SITE_NAME} — Snack boxes on WhatsApp`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_KE',
    title: { default: `${SITE_NAME} — Snack boxes on WhatsApp`, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: { default: `${SITE_NAME} — Snack boxes on WhatsApp`, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
