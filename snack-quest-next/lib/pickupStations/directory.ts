/**
 * Turns a flat list of pickup stations into the county-first
 * structure the website's station picker browses (§ Website Becomes
 * the Primary Commerce Channel — "a modern, intuitive interface" for
 * selecting a station, explicitly not "a long, overwhelming dropdown
 * list"). Pure, no I/O — same discipline as `search.ts` alongside it.
 *
 * Stations whose `county` could not be confidently classified during
 * import (`county: null` — see `types/pickupStation.ts`) are grouped
 * under a single visible bucket rather than silently dropped: they are
 * real stations a customer may well be looking for, and search still
 * reaches them.
 */

export const UNCLASSIFIED_COUNTY = 'Other';

export interface DirectoryStation {
  id: string;
  name: string;
  county: string | null;
  town: string | null;
  description: string;
  deliveryFeeKes: number;
}

export interface CountyGroup {
  county: string;
  stationCount: number;
  /**
   * The cheapest fee among this county's stations — what the picker
   * shows as "from KES x". A range would be misleading in a list that
   * doesn't show which station costs what.
   */
  fromFeeKes: number;
}

/** Sorted by county name, with the unclassified bucket always last so it never displaces a real county. */
export function groupStationsByCounty(stations: DirectoryStation[]): CountyGroup[] {
  const byCounty = new Map<string, DirectoryStation[]>();
  for (const station of stations) {
    const key = station.county?.trim() || UNCLASSIFIED_COUNTY;
    const bucket = byCounty.get(key);
    if (bucket) {
      bucket.push(station);
    } else {
      byCounty.set(key, [station]);
    }
  }

  return [...byCounty.entries()]
    .map(([county, group]) => ({
      county,
      stationCount: group.length,
      fromFeeKes: Math.min(...group.map((station) => station.deliveryFeeKes)),
    }))
    .sort((a, b) => {
      if (a.county === UNCLASSIFIED_COUNTY) return 1;
      if (b.county === UNCLASSIFIED_COUNTY) return -1;
      return a.county.localeCompare(b.county);
    });
}

/** Every station in one county, ordered by town then name so a long county list still reads as a place, not a jumble. */
export function stationsInCounty(stations: DirectoryStation[], county: string): DirectoryStation[] {
  return stations
    .filter((station) => (station.county?.trim() || UNCLASSIFIED_COUNTY) === county)
    .sort((a, b) => (a.town ?? '').localeCompare(b.town ?? '') || a.name.localeCompare(b.name));
}
