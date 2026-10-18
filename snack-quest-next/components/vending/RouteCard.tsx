'use client';

import { useMemo, useState } from 'react';
import { LocateFixed, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { googleMapsLinks, planRoute, type LatLng, type RouteStop } from '@/lib/vending/routePlanner';

const km = (value: number) => (value < 10 ? value.toFixed(1) : Math.round(value).toString());

/**
 * The best order to visit a set of machines, and Google Maps links that
 * navigate it stop by stop. Planned in the browser from the machines'
 * map positions; "Start from where I am" re-plans from the phone's
 * position so the round begins at the nearest machine.
 */
export function RouteCard({ stops, missing = [], intro }: { stops: RouteStop[]; missing?: string[]; intro?: string }) {
  const [start, setStart] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useMemo(() => planRoute(stops, start), [stops, start]);
  const links = useMemo(() => googleMapsLinks(route, start), [route, start]);

  function locate() {
    if (!('geolocation' in navigator)) {
      setError('This phone can’t share its location.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStart({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Location wasn’t shared. The route still works; Google Maps will start from where you are.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  if (stops.length === 0) {
    return <p className="text-sm text-muted-foreground">{missing.length > 0 ? 'None of these machines has a map position yet.' : 'No machines to route.'}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      <p className="text-sm text-foreground">
        {stops.length} stop{stops.length === 1 ? '' : 's'} · about <span className="font-semibold">{km(route.totalKm)} km</span>
        {start ? ' from where you are' : ' from the first machine'}
      </p>

      <ol className="flex flex-col">
        {route.stops.map((stop, index) => (
          <li key={stop.id} className="flex items-start gap-3 border-b border-border py-2 last:border-0">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{stop.label}</p>
              {stop.detail ? <p className="text-xs text-muted-foreground">{stop.detail}</p> : null}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index === 0 && !start ? 'start' : `${km(route.legKm[index])} km`}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        {links.map((link) => (
          <Button key={link.url} asChild size="lg">
            <a href={link.url} target="_blank" rel="noreferrer">
              <Navigation className="size-5" aria-hidden="true" />
              {link.label}
            </a>
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={locate} loading={locating}>
          <LocateFixed className="size-4" aria-hidden="true" />
          {start ? 'Update from where I am' : 'Start from where I am'}
        </Button>
      </div>

      {error ? (
        <p role="status" className="text-sm text-muted-foreground">
          {error}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Not on the route (no map position — add one on the machine&rsquo;s location): {missing.join(', ')}.
        </p>
      ) : null}
      {links.length > 1 ? <p className="text-xs text-muted-foreground">Google Maps takes 10 stops at a time: open each part when you finish the one before.</p> : null}
    </div>
  );
}
