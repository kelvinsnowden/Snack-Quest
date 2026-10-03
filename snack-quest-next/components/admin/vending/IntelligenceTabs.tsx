import Link from 'next/link';

const TABS = [
  { key: 'network', href: '/admin/vending/intelligence', label: 'Network' },
  { key: 'location-types', href: '/admin/vending/intelligence/location-types', label: 'Location types' },
  { key: 'locations', href: '/admin/vending/intelligence/locations', label: 'Locations' },
  { key: 'compare', href: '/admin/vending/intelligence/compare', label: 'Compare locations' },
  { key: 'products', href: '/admin/vending/intelligence/products', label: 'Products' },
  { key: 'plan', href: '/admin/vending/intelligence/plan', label: 'Plan a new machine' },
  { key: 'recommendations', href: '/admin/vending/intelligence/recommendations', label: 'Recommendations' },
] as const;

export type IntelligenceTab = (typeof TABS)[number]['key'];

/** The sections of machine sales intelligence, as one row of tabs on every intelligence page. */
export function IntelligenceTabs({ current }: { current: IntelligenceTab }) {
  return (
    <nav aria-label="Sales intelligence" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
