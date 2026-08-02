import { cn } from '@/lib/utils';

/**
 * The Creator Portal's card (§ Creator Portal premium rebuild).
 *
 * Three cards now exist in the codebase and the distinction is
 * deliberate:
 *   components/ui/card              admin — rounded-md, dense, tabular
 *   marketing/design/SurfaceCard    storefront — rounded-xl, lifts
 *   this                            portal — rounded-lg, calm, static
 *
 * The portal sits between them. It is a consumer product, so it gets
 * more air than the admin card; it is a tool people open daily rather
 * than a page they browse once, so it does not perform on hover the
 * way the storefront does.
 *
 * Grouping is carried by a hairline border and whitespace, not by
 * shadow — the design-system rules put shadow on elevation only, and a
 * card that is not floating above anything has no elevation to
 * communicate. `raised` exists for the genuine exceptions (a surface
 * overlapping another, a sticky summary) and is a single large-blur,
 * low-opacity shadow rather than a stack.
 *
 * Padding is on the 8-point scale and steps up once at `md`: 16 is
 * right when a phone's viewport is the constraint, 24 when it is not.
 */
export function PortalCard({
  children,
  className,
  raised = false,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return (
    <Tag
      className={cn(
        'border-border bg-surface rounded-lg border p-4 md:p-6',
        raised && 'shadow-[0_8px_32px_-12px_rgb(0_0_0/0.12)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
