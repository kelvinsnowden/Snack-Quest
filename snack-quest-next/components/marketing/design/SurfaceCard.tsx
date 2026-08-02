/**
 * The marketing site's card surface (§ Website consistency).
 *
 * Distinct from `components/ui/card`, which is the *admin* card:
 * `rounded-lg` with a flat shadow, tuned for dense data tables. The
 * public site's cards are `rounded-xl` and lift on hover, matching the
 * treatment the home page uses for its box and step cards. Keeping the
 * two separate is deliberate — the admin portal and the storefront are
 * different products with different densities, and collapsing them
 * would drag one towards the other.
 */
export function SurfaceCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'li';
}) {
  return (
    <Tag
      className={`border-border bg-surface rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-md ${className ?? ''}`}
    >
      {children}
    </Tag>
  );
}
