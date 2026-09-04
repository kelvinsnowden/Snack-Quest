'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in', className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 bg-surface shadow-lg transition ease-out',
  {
    variants: {
      side: {
        left: 'inset-y-0 left-0 h-full w-72 border-r border-border data-[state=open]:animate-slide-up',
        right: 'inset-y-0 right-0 h-full w-72 border-l border-border data-[state=open]:animate-slide-up',
        /*
         * The phone-native shape: anchored to the bottom edge, capped
         * short of the top so the page stays visible behind it, and
         * rounded only on the leading corners — which is what makes it
         * read as a panel rising from the edge rather than a window
         * that happens to be near it.
         *
         * `gap-0` because a bottom sheet is a header/body/footer stack
         * where the body scrolls: the shared `gap-4` would put a fixed
         * gutter between a sticky header and a scrolling region, which
         * is a gap that moves.
         */
        bottom:
          'inset-x-0 bottom-0 top-auto max-h-[88dvh] w-full gap-0 rounded-t-3xl border-t border-border data-[state=open]:animate-sheet-up',
      },
    },
    defaultVariants: { side: 'left' },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Classes for the dimmed backdrop — the one part of the sheet a
   * caller cannot otherwise reach. Needed because z-index is a
   * property of the pair: raising the panel above a fixed page element
   * without raising the overlay leaves the backdrop painting behind
   * the very thing it is meant to cover.
   */
  overlayClassName?: string;
  /**
   * Suppress the built-in corner close button, for a sheet that puts
   * its own in a header. Two close buttons in one dialog is a worse
   * answer than either.
   */
  hideClose?: boolean;
}

const SheetContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ side = 'left', className, overlayClassName, hideClose = false, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-border/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5', className)} {...props} />;
}

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-sm font-semibold text-foreground', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('sr-only', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
