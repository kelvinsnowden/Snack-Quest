'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export interface CreatorPickerResult {
  id: string;
  displayName: string;
  email: string;
  status: string;
}

interface CreatorPickerProps {
  selected: CreatorPickerResult[];
  onChange: (next: CreatorPickerResult[]) => void;
}

/**
 * Search-and-pick real creators by name/email (§ Admin: Marketing
 * Emails' `specific_creators` segment) — distinct from the `custom`
 * segment's hand-typed emails, this only ever adds creators that
 * actually exist, found by a live server search rather than guessed.
 */
export function CreatorPicker({ selected, onChange }: CreatorPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/marketing-emails/creator-search?q=${encodeURIComponent(query.trim())}`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { results: CreatorPickerResult[] };
        if (!cancelled) setResults(body.results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  function addCreator(creator: CreatorPickerResult) {
    if (!selected.some((c) => c.id === creator.id)) {
      onChange([...selected, creator]);
    }
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function removeCreator(id: string) {
    onChange(selected.filter((c) => c.id !== id));
  }

  const unselectedResults = results.filter((r) => !selected.some((c) => c.id === r.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search creators by name or email"
          className="pl-9"
        />
        {open && query.trim().length >= 2 ? (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
            {loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : unselectedResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matching creators.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {unselectedResults.map((creator) => (
                  <li key={creator.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addCreator(creator)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-border/10"
                    >
                      <span className="font-medium text-foreground">{creator.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {creator.email} · {creator.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((creator) => (
            <Badge key={creator.id} variant="outline" className="gap-1.5 py-1 pr-1">
              {creator.displayName}
              <button
                type="button"
                onClick={() => removeCreator(creator.id)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-border/30 hover:text-foreground"
                aria-label={`Remove ${creator.displayName}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No creators picked yet — search above to add one.</p>
      )}
    </div>
  );
}
