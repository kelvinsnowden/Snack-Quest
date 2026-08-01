'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SEARCH_RESULT_TYPE_LABELS, type SearchResult, type SearchResultType } from '@/lib/search/types';

const DEBOUNCE_MS = 250;

function groupByType(results: SearchResult[]): [SearchResultType, SearchResult[]][] {
  const groups = new Map<SearchResultType, SearchResult[]>();
  for (const result of results) {
    const existing = groups.get(result.type) ?? [];
    existing.push(result);
    groups.set(result.type, existing);
  }
  return Array.from(groups.entries());
}

export function GlobalSearchTrigger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const trimmed = query.trim();
    const timeoutId = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
        if (response.ok) {
          const body = (await response.json()) as { enabled: boolean; results: SearchResult[] };
          setDisabled(!body.enabled);
          setResults(body.results);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [query, open]);

  function goTo(href: string) {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-64 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-border/20"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 text-caption">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders, customers, products, suppliers, conversations…"
              className="border-0 p-0 shadow-none focus-visible:ring-0"
            />
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {disabled ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Global search is disabled for this business.</p>
            ) : query.trim().length < 2 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
            ) : !loading && results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No results for &quot;{query}&quot;.</p>
            ) : (
              groupByType(results).map(([type, items]) => (
                <div key={type} className="mb-2 last:mb-0">
                  <p className="px-2 py-1 text-caption font-medium text-muted-foreground uppercase">{SEARCH_RESULT_TYPE_LABELS[type]}</p>
                  {items.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => goTo(item.href)}
                      className="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-border/30"
                    >
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                      <span className="text-caption text-muted-foreground">{item.subtitle}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
