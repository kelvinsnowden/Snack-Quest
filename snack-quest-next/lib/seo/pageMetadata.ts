import type { Metadata } from 'next';

/**
 * Every marketing page's static/generated `Metadata` needs the same
 * title+description mirrored into `openGraph`/`twitter` (the root
 * layout's `openGraph.title`/`twitter.title` templates only apply when a
 * page doesn't set its own `openGraph`/`twitter` block at all — setting
 * a bare `title` on a page silently drops OG/Twitter Card sharing for
 * it). Centralized here so every marketing page gets real social-share
 * metadata without repeating this shape ten times.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
