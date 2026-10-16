import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export function InvalidLeadLink() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <AlertCircle className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">This link isn&rsquo;t valid</h1>
      <p className="text-muted-foreground max-w-md text-pretty text-base">
        It may have been copied incompletely. Open it straight from the email, or message us on WhatsApp.
      </p>
      <Link href="/contact" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
        Contact us
      </Link>
    </div>
  );
}
