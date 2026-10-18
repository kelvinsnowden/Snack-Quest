import 'server-only';

import { isUsablePosition, type RouteStop } from '@/lib/vending/routePlanner';
import type { Location, Machine } from '@/types';

/**
 * Route stops for machines: a machine's own map position, else its
 * location's. Machines with neither are returned by code in `missing`, so
 * the page can say which are left off rather than drop them silently.
 */
export function machineRouteStops(
  machines: { id: string; data: Machine }[],
  locations: { id: string; data: Location }[],
  detailFor: (machineId: string) => string | null = () => null,
): { stops: RouteStop[]; missing: string[] } {
  const place = new Map(locations.map(({ id, data }) => [id, data]));
  const stops: RouteStop[] = [];
  const missing: string[] = [];
  for (const { id, data } of machines) {
    const location = data.locationId ? place.get(data.locationId) : undefined;
    const position = [{ latitude: data.latitude, longitude: data.longitude }, location ? { latitude: location.latitude, longitude: location.longitude } : null].find(isUsablePosition) ?? null;
    if (!position) {
      missing.push(data.machineCode);
      continue;
    }
    const where = location?.name ?? data.venueName ?? null;
    const extra = detailFor(id);
    stops.push({
      id,
      label: where ? `${data.machineCode} · ${where}` : data.machineCode,
      detail: [location?.address ?? data.address ?? null, extra].filter(Boolean).join(' · ') || null,
      latitude: position.latitude,
      longitude: position.longitude,
    });
  }
  return { stops, missing };
}
