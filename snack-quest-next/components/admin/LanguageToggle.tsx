'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/locales';
import { useI18n, useLocale } from './i18n/LocaleProvider';
import { cn } from '@/lib/utils';

/**
 * The language switch (§ Admin in Simplified Chinese).
 *
 * Each language is written in itself — 简体中文, not "Chinese
 * (Simplified)" — because the person who needs this button is by
 * definition the one who cannot comfortably read the current
 * language, and an English label naming their language is no help to
 * them.
 *
 * `router.refresh()` rather than a full reload: the locale is read
 * server-side, so the server re-renders every visible Server Component
 * in the new language while the client keeps its place on the page. A
 * reload would throw away scroll position and any open dialog, which
 * is a rough way to answer "what does this say in my language".
 */
export function LanguageToggle({ className }: { className?: string }) {
  const router = useRouter();
  const current = useLocale();
  const { dict } = useI18n();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function choose(next: Locale) {
    if (next === current || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      // Only refresh once the preference is actually stored. Refreshing
      // regardless would redraw the portal in the old language and look
      // like the button had simply failed.
      if (response.ok) {
        startTransition(() => router.refresh());
      }
    } catch {
      // Offline or the request never landed. The portal stays in the
      // language it is already in, which is a safe place to be.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={dict.language.switchTo}
      className={cn(
        'border-border bg-surface inline-flex items-center gap-0.5 rounded-full border p-0.5',
        (saving || pending) && 'opacity-60',
        className,
      )}
    >
      <Languages className="text-muted-foreground ml-1.5 size-3.5 shrink-0" aria-hidden="true" />
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          aria-pressed={locale === current}
          disabled={saving || pending}
          className={cn(
            'focus-visible:ring-primary rounded-full px-2.5 py-1 text-caption font-medium transition focus-visible:ring-2 focus-visible:outline-none',
            locale === current
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
