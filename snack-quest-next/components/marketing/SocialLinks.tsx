import { SOCIAL_LINKS } from '@/lib/config/socialLinks';

/**
 * lucide-react deliberately ships no brand marks (licensing), so these
 * three are minimal hand-drawn glyphs — same 24x24 viewBox convention
 * as lucide, sized via the shared `className` so they drop into any
 * icon-button slot unchanged.
 */
function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 21v-7.8h2.6l.4-3h-3v-1.93c0-.87.24-1.46 1.5-1.46h1.6V4.14c-.28-.04-1.23-.12-2.34-.12-2.32 0-3.9 1.42-3.9 4.02V10.2H7.7v3h2.66V21h3.14Z" />
    </svg>
  );
}

function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.6 3c.4 2.4 2 4 4.6 4.2v3.1c-1.6.1-3-.4-4.6-1.4v6.6a5.6 5.6 0 1 1-4.9-5.6v3.2a2.4 2.4 0 1 0 1.9 2.4V3h3Z" />
    </svg>
  );
}

const SOCIAL_ITEMS = [
  { href: SOCIAL_LINKS.facebook, label: 'Facebook', Icon: FacebookIcon },
  { href: SOCIAL_LINKS.instagram, label: 'Instagram', Icon: InstagramIcon },
  { href: SOCIAL_LINKS.tiktok, label: 'TikTok', Icon: TikTokIcon },
];

export function SocialLinks({ className }: { className?: string }) {
  return (
    <div className={className}>
      {SOCIAL_ITEMS.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${label} (opens in a new tab)`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
