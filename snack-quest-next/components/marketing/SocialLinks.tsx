import { SOCIAL_LINKS } from '@/lib/config/socialLinks';
import { FacebookIcon } from '@/components/icons/FacebookIcon';
import { InstagramIcon } from '@/components/icons/InstagramIcon';
import { TikTokIcon } from '@/components/icons/TikTokIcon';

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
