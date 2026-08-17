import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { listPosts } from '@/lib/blog/posts';

export const metadata: Metadata = buildPageMetadata({
  title: 'Blog',
  description: 'Guides to snacks from Japan, Korea, China, and Thailand, and everything else about ordering with Snack Quest.',
  path: '/blog',
});

function formatPublished(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogIndexPage() {
  const posts = listPosts();

  return (
    <PageShell width="wide">
      <PageHero
        eyebrow="The dispatch"
        eyebrowIcon={BookOpen}
        title="From the"
        accent="quest log."
        subtitle="Guides to what you're actually eating, and everything else about ordering with Snack Quest."
      />

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2">
        {posts.map((post, index) => (
          <Reveal key={post.slug} delayMs={index * 80}>
            <SurfaceCard as="article">
              <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col">
                <p className="text-caption text-muted-foreground">{formatPublished(post.publishedAt)}</p>
                <h2 className="text-card-title mt-2 font-semibold text-foreground group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="text-body mt-2 flex-1 text-muted-foreground">{post.description}</p>
                <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
                  Read more
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </SurfaceCard>
          </Reveal>
        ))}
      </div>
    </PageShell>
  );
}
