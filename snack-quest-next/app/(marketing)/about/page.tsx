import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Compass, MapPin, Package, Smartphone } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { BRAND_DESCRIPTION_LONG, FOUNDER_NAME, SOURCE_COUNTRIES } from '@/lib/seo/entity';

export const metadata: Metadata = buildPageMetadata({
  title: 'About Snack Quest',
  description: BRAND_DESCRIPTION_LONG,
  path: '/about',
});

const FOUNDER_STORY = `${FOUNDER_NAME} never planned to start a snack company. Working alongside Chinese colleagues opened up a world of snacks he'd never seen before — some surprised him, some became an instant favourite, and that feeling of discovering something unexpected felt worth sharing. Today, every snack in a Snack Quest box has been personally tasted and selected, so that same sense of discovery reaches whoever opens the box next.`;

const FACTS = [
  {
    icon: Package,
    title: 'What a box is',
    body: `A hand-picked, personally tasted mix of imported snacks from ${SOURCE_COUNTRIES.join(', ')} — a curated surprise, not a single-country selection. No two boxes are exactly the same.`,
  },
  {
    icon: Smartphone,
    title: 'How you pay',
    body: 'On the website, with M-Pesa. No app to install — just a name, a phone number, and an M-Pesa PIN.',
  },
  {
    icon: MapPin,
    title: 'Where it ships',
    body: 'To your door in Nairobi and the surrounding towns, or to a Fargo Courier pickup point anywhere else in Kenya. Most orders arrive within 24–48 hours.',
  },
];

export default async function AboutPage() {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';
  const siteUrl = getSiteUrl();
  const aboutUrl = `${siteUrl}/about`;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${aboutUrl}#page`,
        url: aboutUrl,
        name: `About ${businessName}`,
        description: BRAND_DESCRIPTION_LONG,
        mainEntity: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'Person',
        '@id': `${siteUrl}/#founder`,
        name: FOUNDER_NAME,
        jobTitle: 'Founder',
        worksFor: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'About', item: aboutUrl },
        ],
      },
    ],
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdGraph) }}
      />

      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-foreground font-medium" aria-current="page">
          About
        </span>
      </nav>

      <div className="mt-6">
        <PageHero
          eyebrow="About Snack Quest"
          eyebrowIcon={Compass}
          title="A Kenya-based"
          accent="mystery snack company."
          subtitle={BRAND_DESCRIPTION_LONG}
        />
      </div>

      <Reveal delayMs={80}>
        <div className="mt-14 border-l-2 border-primary/20 pl-6">
          <p className="text-card-title font-semibold text-foreground">Why it exists</p>
          <p className="text-body mt-3 max-w-2xl text-muted-foreground">{FOUNDER_STORY}</p>
          <p className="mt-4 font-signature text-2xl text-secondary italic">{FOUNDER_NAME}</p>
          <p className="text-caption mt-0.5 font-semibold tracking-[0.2em] text-foreground/60 uppercase">
            Founder, {businessName}
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FACTS.map((fact, index) => (
          <Reveal key={fact.title} delayMs={index * 80}>
            <SurfaceCard className="h-full">
              <fact.icon className="size-6 text-secondary" aria-hidden="true" />
              <p className="text-card-title mt-3 font-semibold text-foreground">{fact.title}</p>
              <p className="text-body mt-2 text-muted-foreground">{fact.body}</p>
            </SurfaceCard>
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={120}>
        <SurfaceCard className="mt-10">
          <p className="text-card-title font-semibold text-foreground">More to explore</p>
          <ul className="mt-3 flex flex-col gap-2 text-body text-muted-foreground">
            <li>
              <Link href="/how-it-works" className="text-primary hover:underline">
                How ordering, payment, and delivery actually work
              </Link>
            </li>
            <li>
              <Link href="/blog" className="text-primary hover:underline">
                Guides to Japanese, Korean, and imported snacks
              </Link>
            </li>
            <li>
              <Link href="/creators" className="text-primary hover:underline">
                The Creator Program — earn a commission sharing Snack Quest
              </Link>
            </li>
            <li>
              <Link href="/press" className="text-primary hover:underline">
                Press &amp; partnerships
              </Link>
            </li>
          </ul>
        </SurfaceCard>
      </Reveal>

      <Reveal delayMs={160}>
        <div className="mt-14 flex justify-center">
          <BuyNowButton analyticsSource="about">See the boxes</BuyNowButton>
        </div>
      </Reveal>
    </PageShell>
  );
}
