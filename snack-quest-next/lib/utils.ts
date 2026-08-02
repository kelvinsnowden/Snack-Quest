import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind class lists, resolving conflicting utilities in favor of the later one — the standard shadcn/ui `cn()` helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
