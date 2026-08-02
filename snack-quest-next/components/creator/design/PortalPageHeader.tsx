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
 * Title size matches the dashboard's `h1` rather than the marketing
 * site's display face: the portal is a tool, and a storefront-scale
 * headline on a screen someone opens ten times a day reads as shouting.
 */
export function PortalPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-foreground text-[1.75rem] leading-tight font-semibold tracking-tight md:text-[2rem]">
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
