'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatKes } from '@/lib/orders/format';
import type { CountyGroup, DirectoryStation } from '@/lib/pickupStations/directory';

/**
 * The Jumia pickup-station selector (§ Website Becomes the Primary
 * Commerce Channel — "a modern, intuitive interface" for choosing a
 * station, explicitly not "a long, overwhelming dropdown list" of the
 * ~200 stations nationwide).
 *
 * Two ways in, both leading to the same selection:
 *
 *   Browse — counties first, then the stations inside one. A customer
 *   who knows where they live can always get there in two taps
 *   without knowing any station's name.
 *
 *   Search — typing anything switches to nationwide results ranked by
 *   the same server-side scorer the WhatsApp flow uses. For the
 *   customer who knows exactly which station they want.
 *
 * Fees come from the server with each station and are displayed, never
 * computed here — the figure charged is re-read from `pickupStations`
 * at checkout regardless of what this component showed.
 *
 * All fetching is driven by one `view` value rather than by scattered
 * imperative calls: whatever view is current names exactly one URL, so
 * a stale response can never repaint a list the customer has already
 * navigated away from.
 */

export interface SelectedStation {
  id: string;
  name: string;
  county: string | null;
  town: string | null;
  deliveryFeeKes: number;
}

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_LENGTH = 2;

/** The one piece of state that decides what is on screen and what is being fetched. */
type View = { kind: 'counties' } | { kind: 'county'; county: string } | { kind: 'search'; query: string };

interface StationsPayload {
  counties?: CountyGroup[];
  stations?: DirectoryStation[];
}

function urlFor(view: View): string {
  if (view.kind === 'county') {
    return `/api/pickup-stations?county=${encodeURIComponent(view.county)}`;
  }
  if (view.kind === 'search') {
    return `/api/pickup-stations?q=${encodeURIComponent(view.query)}`;
  }
  return '/api/pickup-stations';
}

export function PickupStationPicker({
  selected,
  onSelect,
}: {
  selected: SelectedStation | null;
  onSelect: (station: SelectedStation | null) => void;
}) {
  const [view, setView] = useState<View>({ kind: 'counties' });
  const [counties, setCounties] = useState<CountyGroup[]>([]);
  const [stations, setStations] = useState<DirectoryStation[]>([]);
  const [query, setQuery] = useState('');
  // Starts true because the county list is fetched on mount — deriving
  // it that way avoids flipping the flag from inside the effect body.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce typing into a view change. The state update happens in the
  // timer callback, not synchronously while the effect runs.
  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(() => {
      setLoading(true);
      setView(trimmed.length >= MIN_SEARCH_LENGTH ? { kind: 'search', query: trimmed } : { kind: 'counties' });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const url = urlFor(view);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error('request failed');
        }
        return response.json() as Promise<StationsPayload>;
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        if (payload.counties) {
          setCounties(payload.counties);
        }
        setStations(payload.stations ?? []);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("We couldn't load pickup stations. Check your connection and try again.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view]);

  if (selected) {
    return (
      <div className="border-border bg-surface flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="flex min-w-0 items-start gap-3">
          <MapPin className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-medium">{selected.name}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {[selected.town, selected.county].filter(Boolean).join(', ') || 'Pickup station'}
              {selected.deliveryFeeKes > 0 ? ` · ${formatKes(selected.deliveryFeeKes)} delivery` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-primary shrink-0 rounded-md p-1 outline-none focus-visible:ring-2"
          aria-label="Choose a different pickup station"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const heading =
    view.kind === 'search'
      ? `Results for “${view.query}”`
      : view.kind === 'county'
        ? view.county
        : 'Choose your county';

  return (
    <div className="border-border bg-surface overflow-hidden rounded-lg border">
      <div className="border-border border-b p-4">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a town or station — e.g. Kasarani"
            className="pl-9"
            aria-label="Search pickup stations"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pt-4">
        {view.kind === 'county' ? (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setQuery('');
              setView({ kind: 'counties' });
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-primary -ml-1 flex items-center gap-1 rounded-md p-1 text-sm outline-none focus-visible:ring-2"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            All counties
          </button>
        ) : null}
        <p className="text-muted-foreground text-sm font-medium">{heading}</p>
        {loading ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" /> : null}
      </div>

      {error ? (
        <p className="text-danger px-4 py-6 text-sm">{error}</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto p-2">
          {view.kind === 'counties'
            ? counties.map((county) => (
                <li key={county.county}>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setView({ kind: 'county', county: county.county });
                    }}
                    className="hover:bg-border/40 focus-visible:ring-primary flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left outline-none focus-visible:ring-2"
                  >
                    <span className="text-foreground text-sm font-medium">{county.county}</span>
                    <span className="text-muted-foreground text-sm">
                      {county.stationCount} {county.stationCount === 1 ? 'station' : 'stations'}
                    </span>
                  </button>
                </li>
              ))
            : stations.map((station) => (
                <li key={station.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({
                        id: station.id,
                        name: station.name,
                        county: station.county,
                        town: station.town,
                        deliveryFeeKes: station.deliveryFeeKes,
                      })
                    }
                    className="hover:bg-border/40 focus-visible:ring-primary w-full rounded-md px-3 py-3 text-left outline-none focus-visible:ring-2"
                  >
                    <span className="text-foreground block text-sm font-medium">{station.name}</span>
                    <span className="text-muted-foreground mt-0.5 block text-sm">
                      {[station.town, station.county].filter(Boolean).join(', ') || 'Kenya'}
                      {station.deliveryFeeKes > 0 ? ` · ${formatKes(station.deliveryFeeKes)}` : ''}
                    </span>
                  </button>
                </li>
              ))}

          {!loading && view.kind === 'search' && stations.length === 0 ? (
            <li className="text-muted-foreground px-3 py-6 text-sm">
              No stations matched “{view.query}”. Try a town name instead.
            </li>
          ) : null}
          {!loading && view.kind === 'county' && stations.length === 0 ? (
            <li className="text-muted-foreground px-3 py-6 text-sm">
              No stations are listed for {view.county} right now.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
