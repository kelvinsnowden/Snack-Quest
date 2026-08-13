import { UtensilsCrossed, FileText } from 'lucide-react';
import { TikTokIcon } from '@/components/icons/TikTokIcon';
import { InstagramIcon } from '@/components/icons/InstagramIcon';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Reveal } from '../design/Reveal';

/**
 * "What can I actually post?" (§ Creator Program CRO pass, brief item
 * 7) — a creator can understand the economics and still stall on this
 * exact question. Real platform icons (TikTok/Instagram/WhatsApp),
 * matching the "no emoji for a recognizable brand" standard the rest
 * of the page now holds; "Food & lifestyle" isn't a platform, so it
 * gets a plain lucide glyph instead of a fabricated brand mark.
 *
 * The campaign-assets line is the one concrete resource this platform
 * genuinely provides beyond a link — `Campaign.assetsUrl` /
 * `documentUrl` / `referenceLink` are real fields an admin can attach
 * per campaign (`types/campaign.ts`), surfaced to creators on
 * `/creator/campaigns`. Nothing here promises resources that don't
 * exist in the product.
 */
const POST_IDEAS = [
  {
    icon: TikTokIcon,
    platform: 'TikTok / Reel',
    idea: 'A short reaction video, or the founder story in your own words.',
  },
  {
    icon: InstagramIcon,
    platform: 'Instagram Story',
    idea: 'A quick recommendation with your link in the sticker or your bio.',
  },
  {
    icon: WhatsAppIcon,
    platform: 'WhatsApp',
    idea: 'Send the offer to friends, family, or a group that already trusts you.',
  },
  {
    icon: UtensilsCrossed,
    platform: 'Food & lifestyle content',
    idea: 'Unbox the box, talk through what came in it, share your honest reaction.',
  },
] as const;

export function CreatorWhatToPost() {
  return (
    <section className="bg-background px-5 py-16 md:px-10 md:py-32">
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-caption text-secondary font-bold tracking-[0.3em] uppercase">
            Content ideas
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            What can you actually post?
          </h2>
        </div>
      </Reveal>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2 md:mt-16">
        {POST_IDEAS.map((item, index) => (
          <Reveal key={item.platform} delayMs={index * 100}>
            <div className="border-border bg-surface flex h-full flex-col gap-2 rounded-2xl border p-6">
              <div className="text-secondary flex items-center gap-2.5">
                <item.icon className="size-5" aria-hidden="true" />
                <p className="text-foreground font-semibold">{item.platform}</p>
              </div>
              <p className="text-small text-foreground/70">{item.idea}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={POST_IDEAS.length * 100 + 60}>
        <p className="text-foreground/60 mx-auto mt-8 flex max-w-lg items-start justify-center gap-2 text-center text-sm md:mt-12">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Snack Quest also runs opt-in campaigns with ready-made creative assets and briefs —
          you&apos;ll find these in your dashboard once you&apos;re approved.
        </p>
      </Reveal>
    </section>
  );
}
