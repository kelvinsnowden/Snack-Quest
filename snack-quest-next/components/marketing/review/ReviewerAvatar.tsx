/**
 * The reviewer's initial, in a tinted disc.
 *
 * The reference design puts a photograph of each reviewer here, and we
 * do not have one: `PublicReview` carries a name, a rating, a body,
 * their box photos and a date, and nothing else. A stock face beside a
 * real person's name would be a fabricated customer on a page whose
 * entire job is being believed, so this renders what we actually
 * know — the first letter of the name they gave.
 *
 * The tint is derived from the name rather than random, so the same
 * customer is the same colour in the featured card and again in the
 * sheet, and it is drawn from the brand's own three accents rather
 * than a generated hue that would not belong to this palette.
 */
const TINTS = [
  'bg-primary/12 text-primary',
  'bg-secondary/12 text-secondary',
  'bg-success/12 text-success',
] as const;

export function ReviewerAvatar({ name, className = 'size-9' }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  // Sum of code points: stable across renders and across the server /
  // client boundary, which a hash with any randomness in it would not be.
  const tint = TINTS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TINTS.length];

  return (
    <span
      aria-hidden="true"
      className={`${className} ${tint} flex shrink-0 items-center justify-center rounded-full text-sm font-bold`}
    >
      {initial}
    </span>
  );
}
