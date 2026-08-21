import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          // 16px on phones, 14px from `sm` up. Not a taste call: iOS
          // Safari zooms the whole page in when a focused input's text
          // is under 16px, and never zooms back out — so every form on
          // a phone jumped and then stayed magnified, with the layout
          // pushed off-screen. Desktop is unchanged at `sm:text-sm`.
          'flex h-11 md:h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger sm:text-sm',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
