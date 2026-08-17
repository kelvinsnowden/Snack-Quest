import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { Geist, Geist_Mono, Bagel_Fat_One } from 'next/font/google';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { ADMIN_THEME_STORAGE_KEY } from '@/lib/theme/adminTheme';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/**
 * The home page's display face (§ jungle-adventure landing page rebuild)
 * — a single chunky weight, additive alongside Geist so the rest of the
 * platform (Admin, Warehouse, Finance, Creator Portal) is unaffected.
 * Exposed as `--font-display`, consumed only by the marketing home
 * page's own heading styles.
 */
const displayFont = Bagel_Fat_One({
  variable: '--font-bagel-fat-one',
  weight: '400',
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
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} h-full antialiased`}
      // `data-theme` is set by the inline script below, deliberately
      // outside React's own render output for this element — the
      // documented case for suppressHydrationWarning (React: "if this
      // attribute change is caused by something outside of React").
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/*
          Applies the Admin portal's stored light/dark preference to
          `<html>` before first paint (§ Admin Dashboard redesign).
          `beforeInteractive` must live directly in the root layout —
          confirmed against this Next.js version's own bundled docs —
          so it's inlined here rather than a separate component. The
          script itself is scoped to `/admin`: it's a no-op everywhere
          else, so the public marketing site's `data-theme` is never
          touched, and `ThemeToggle`'s unmount cleanup handles the
          client-side-navigation half of that same guarantee.
        */}
        <Script id="admin-theme-init" strategy="beforeInteractive">
          {`(function(){try{if(!location.pathname.startsWith('/admin'))return;var t=localStorage.getItem(${JSON.stringify(ADMIN_THEME_STORAGE_KEY)});document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`}
        </Script>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
