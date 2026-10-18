import Image from 'next/image';
import { cn } from '@/lib/utils';

/** A product's photo for packing and loading — a square tile, a row picture or a small thumbnail, with a clear "No photo" when there isn't one. */
export function ProductPhoto({ src, alt, size }: { src: string | null; alt: string; size: 'tile' | 'row' | 'thumb' }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden bg-muted/40', size === 'tile' ? 'aspect-square w-full rounded-xl' : size === 'row' ? 'size-16 rounded-xl' : 'size-12 rounded-lg')}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={size === 'tile' ? '(max-width: 640px) 45vw, 200px' : size === 'row' ? '64px' : '48px'} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-xs font-medium text-warning">No photo</span>
      )}
    </span>
  );
}
