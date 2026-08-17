import Image from 'next/image';
import Link from 'next/link';
import { SocialLinks } from './SocialLinks';

/** Not a component/hook — safe to call `Date.now()` here (matches lib/inventory/expiry.ts's own note on this ESLint rule). */
function currentYear(): number {
  return new Date().getFullYear();
}

/**
 * Flat, single-row link list (§ reduce footer height ~70%) — the
 * previous footer stacked four titled columns (Snack Quest / Creators
 * / Support / Legal), each three-plus links tall, under 48px of
 * top-and-bottom container padding. That height comes from the
 * *number of stacked rows*, not spacing choices, so tightening gaps
 * alone couldn't get close to a 70% cut without losing links. Every
 * link below is unchanged from the old four-column list — just laid
 * out as one wrapped row instead of four stacked ones, which is
 * shorter and, for ten links, no less scannable.
 */
const FOOTER_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/boxes', label: 'Boxes' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/creators', label: 'Creator program' },
  { href: '/creators/academy', label: 'Creator Academy' },
  { href: '/creator/register', label: 'Become a creator' },
  { href: '/creator/login', label: 'Creator sign in' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/review', label: 'Leave a review' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact us' },
  { href: '/press', label: 'Press' },
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/terms', label: 'Terms of service' },
];

export function MarketingFooter({ businessName }: { businessName: string }) {
  return (
    <footer className="border-border bg-surface border-t pb-20 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <Image src="/logo.png" alt="Snack Quest" width={24} height={24} className="size-6 rounded-md object-cover" />
            <span className="text-foreground text-sm font-semibold tracking-tight">
              {businessName}
            </span>
          </Link>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end"
          >
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-caption text-muted-foreground text-center sm:text-left">
            © {currentYear()} {businessName}. All rights reserved.
          </p>
          <SocialLinks className="flex items-center gap-3" />
        </div>
      </div>
    </footer>
  );
}
