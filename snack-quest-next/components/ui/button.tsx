import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 active:bg-secondary/95',
        outline: 'border border-border bg-surface text-foreground hover:bg-border/30',
        ghost: 'text-foreground hover:bg-border/40',
        danger: 'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90',
      },
      /*
       * Every size is at least 44px on touch and keeps its old density
       * from `md` up. An audit of the Creator Portal at 390px found
       * sub-44px targets on all eight pages, and they were not page
       * bugs — `sm` rendered 32px and the default 40px, so every button
       * in every portal was under the minimum on a phone.
       *
       * On touch there is no meaningful "small button": the finger is
       * one size. Density is a desktop affordance, which is why `sm`
       * and `md` converge on mobile and separate again on a pointer.
       */
      size: {
        sm: 'h-11 px-3 text-xs md:h-8',
        md: 'h-11 px-4 md:h-10',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11 md:size-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    // Radix's `Slot` (used when `asChild`) requires exactly one element
    // child to clone props onto — it cannot accept the loading-spinner
    // sibling `<button>` gets, or it throws at render time. `asChild` is
    // for wrapping a single element (typically a `next/link` `Link`),
    // which doesn't participate in this component's own loading state
    // anyway, so it renders `children` alone in that mode.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
