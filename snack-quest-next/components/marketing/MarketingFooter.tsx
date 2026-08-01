import Link from 'next/link';

/** Not a component/hook — safe to call `Date.now()` here (matches lib/inventory/expiry.ts's own note on this ESLint rule). */
function currentYear(): number {
  return new Date().getFullYear();
}

const FOOTER_SECTIONS = [
  {
    title: 'Snack Quest',
    links: [
      { href: '/boxes', label: 'Boxes' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/about', label: 'Our story' },
    ],
  },
  {
    title: 'Creators',
    links: [
      { href: '/creators', label: 'Creator program' },
      { href: '/creator/register', label: 'Become a creator' },
      { href: '/creator/login', label: 'Creator sign in' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/faq', label: 'FAQ' },
      { href: '/contact', label: 'Contact us' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of service' },
    ],
  },
];

export function MarketingFooter({ businessName }: { businessName: string }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                SQ
              </span>
              <span className="text-base font-bold tracking-tight text-foreground">{businessName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Snack boxes ordered on WhatsApp, delivered across Kenya.
            </p>
          </div>
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-caption font-semibold tracking-wide text-foreground uppercase">{section.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-6 text-caption text-muted-foreground">
          © {currentYear()} {businessName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
