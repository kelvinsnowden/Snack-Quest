/**
 * Visiting order for a technician's round (§ F4 routes): the shortest
 * way through a set of machines, optionally from a fixed start (the
 * rider's current position), ending at the last machine.
 *
 * Distances are straight-line (haversine) times a road factor — good
 * enough to choose an order, and the turn-by-turn route itself comes
 * from Google Maps, which the round opens in. Ordering is nearest-
 * neighbour then 2-opt improvement, exact for the handful of machines a
 * round usually has and close to optimal for a whole fleet. No external
 * API, so it costs nothing and works for any number of machines.
 */
export interface RouteStop {
  id: string;
  label: string;
  detail?: string | null;
  latitude: number;
  longitude: number;
}

export interface PlannedRoute {
  stops: RouteStop[];
  /** Estimated road kilometres from the previous point (the start, for the first stop). */
  legKm: number[];
  totalKm: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Nairobi roads are rarely straight: a straight line times this is a fair road estimate. */
const ROAD_FACTOR = 1.3;
const EARTH_KM = 6371;

export function roadKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h))) * ROAD_FACTOR;
}

export function isUsablePosition(value: { latitude?: number | null; longitude?: number | null } | null | undefined): value is LatLng {
  return (
    !!value &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180 &&
    !(value.latitude === 0 && value.longitude === 0)
  );
}

function pathKm(order: number[], points: LatLng[], start: LatLng | null): number {
  let total = start && order.length > 0 ? roadKm(start, points[order[0]]) : 0;
  for (let i = 1; i < order.length; i += 1) total += roadKm(points[order[i - 1]], points[order[i]]);
  return total;
}

/** The visiting order. With no start, the round starts at whichever machine gives the shortest path. */
export function planRoute(stops: RouteStop[], start: LatLng | null = null): PlannedRoute {
  if (stops.length === 0) return { stops: [], legKm: [], totalKm: 0 };
  const points = stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude }));
  const n = points.length;

  const nearestFrom = (first: number | null): number[] => {
    const left = new Set(points.map((_, i) => i));
    const order: number[] = [];
    let at: LatLng | null = start;
    if (first !== null) {
      order.push(first);
      left.delete(first);
      at = points[first];
    }
    while (left.size > 0) {
      let best = -1;
      let bestKm = Infinity;
      for (const i of left) {
        const km = at ? roadKm(at, points[i]) : 0;
        if (km < bestKm) {
          bestKm = km;
          best = i;
        }
      }
      order.push(best);
      left.delete(best);
      at = points[best];
    }
    return order;
  };

  // 2-opt: reverse any stretch of the path that makes it shorter, until
  // nothing does. Only the two edges at the ends of the stretch change,
  // so each try costs four distances, not a whole path.
  const improve = (initial: number[]): number[] => {
    const order = [...initial];
    const before = (k: number): LatLng | null => (k === 0 ? start : points[order[k - 1]]);
    const after = (k: number): LatLng | null => (k === n - 1 ? null : points[order[k + 1]]);
    const edge = (a: LatLng | null, b: LatLng | null) => (a && b ? roadKm(a, b) : 0);
    let improved = true;
    for (let round = 0; improved && round < 500; round += 1) {
      improved = false;
      for (let i = 0; i < n - 1; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const a = before(i);
          const d = after(j);
          const delta = edge(a, points[order[j]]) + edge(points[order[i]], d) - edge(a, points[order[i]]) - edge(points[order[j]], d);
          if (delta < -1e-9) {
            order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
            improved = true;
          }
        }
      }
    }
    return order;
  };

  // From a fixed start one construction is enough; without one, try a few starting machines.
  const seeds = start ? [null] : n <= 30 ? points.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3)];
  let best: number[] | null = null;
  for (const seed of seeds) {
    const order = improve(nearestFrom(seed));
    if (!best || pathKm(order, points, start) < pathKm(best, points, start)) best = order;
  }

  const ordered = best!.map((i) => stops[i]);
  const legKm = ordered.map((stop, i) => (i === 0 ? (start ? roadKm(start, stop) : 0) : roadKm(ordered[i - 1], stop)));
  return { stops: ordered, legKm, totalKm: legKm.reduce((sum, km) => sum + km, 0) };
}

/** Google Maps takes an origin, a destination and up to 9 stops between them in one link. */
const MAX_WAYPOINTS = 9;

/**
 * Turn-by-turn links for a planned round, in order. A long round is cut
 * into parts that follow on from each other (each part starts where the
 * last ended). Without an origin, Google Maps starts from where the
 * phone is.
 */
export function googleMapsLinks(route: PlannedRoute, start: LatLng | null = null): { label: string; url: string }[] {
  const coords = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
  const links: { label: string; url: string }[] = [];
  const stops = route.stops;
  let index = 0;
  let origin: LatLng | null = start;
  while (index < stops.length) {
    // Each link visits up to 10 machines: 9 waypoints and the destination.
    const chunk = stops.slice(index, index + MAX_WAYPOINTS + 1);
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(0, -1);
    const params = new URLSearchParams({ api: '1', destination: coords(destination), travelmode: 'driving' });
    if (origin) params.set('origin', coords(origin));
    if (waypoints.length > 0) params.set('waypoints', waypoints.map(coords).join('|'));
    const first = index + 1;
    const last = index + chunk.length;
    links.push({ label: stops.length <= MAX_WAYPOINTS + 1 ? 'Open the route in Google Maps' : `Part ${links.length + 1}: stops ${first}–${last}`, url: `https://www.google.com/maps/dir/?${params.toString()}` });
    origin = destination;
    index += chunk.length;
  }
  return links;
}
