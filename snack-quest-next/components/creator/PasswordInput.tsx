'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * A password `Input` with a show/hide toggle — every creator auth form
 * was blind-typing before this.
 *
 * The toggle is the one control on these forms most likely to be
 * tapped with a thumb, and at 24px it was well under the ~44px anyone
 * can reliably hit. It's now a full-height target inside the field,
 * with the icon still drawn small — bigger to tap, identical to look
 * at.
 */
export function PasswordInput(props: React.ComponentPropsWithoutRef<typeof Input>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-primary absolute top-0 right-0 flex h-full w-11 items-center justify-center rounded-r-md focus-visible:ring-2 focus-visible:outline-none"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
