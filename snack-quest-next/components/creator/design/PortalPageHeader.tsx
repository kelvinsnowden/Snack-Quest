/**
 * The heading block every portal screen opens with (§ Creator Portal
 * premium rebuild): title, one line of orientation, and an optional
 * primary action.
 *
 * The action stacks below the text on a phone and moves beside it at
 * `sm`. Floating it opposite the title at every width is the reflex,
 * but on a 360px screen it squeezes the heading into two or three
 * ragged lines to make room for a button — the heading is what the
 * screen is, so it keeps the width.
 *
 * The title carries the brand's display face (§ brand consistency
 * pass) — the portal used the system stack, which is a large part of
 * why it felt like a different product from the site that recruited
 * the creator into it.
 *
 * Held well below storefront scale on purpose. The home page's headings
 * run to 60px because they are seen once; this is a screen someone
 * opens ten times a day, and the same size would read as shouting. Same
 * voice, quieter room.
 *
 * `variant` exists because that reasoning covers page *names* and not
 * page *content*. "Earnings" and "Campaigns" are the brand speaking, and
 * a chunky uppercase face suits them. A campaign's title is a sentence
 * somebody typed into the admin — setting that in an uppercased display
 * face makes it shout, wrecks any title long enough to wrap, and
 * misrepresents data as branding. Content titles keep the body face and
 * the author's own capitalisation.
 */
export function PortalPageHeader({
  title,
  description,
  action,
  variant = 'brand',
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** `'brand'` for a fixed page name; `'content'` for anything a person authored. */
  variant?: 'brand' | 'content';
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1
          className={
            variant === 'brand'
              ? 'font-display text-foreground text-2xl leading-[1.1] font-normal tracking-tight uppercase md:text-[2rem]'
              : 'text-foreground text-2xl leading-tight font-semibold tracking-tight text-balance md:text-[1.75rem]'
          }
        >
          {title}
        </h1>
        {description ? (
          <p className="text-body text-muted-foreground mt-2 max-w-prose">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
