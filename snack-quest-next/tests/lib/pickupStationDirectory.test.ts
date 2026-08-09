import { describe, expect, it } from 'vitest';
import {
  groupStationsByCounty,
  stationsInCounty,
  UNCLASSIFIED_COUNTY,
  type DirectoryStation,
} from '@/lib/pickupStations/directory';

/**
 * The county-first station browse (§ Website Becomes the Primary
 * Commerce Channel). The behaviour worth pinning down is what happens
 * to the stations whose county couldn't be classified at import time:
 * they must stay reachable, and they must never sort above a real
 * county.
 */

function station(overrides: Partial<DirectoryStation> & { id: string }): DirectoryStation {
  return {
    name: `Station ${overrides.id}`,
    county: 'Nairobi',
    town: 'Nairobi',
    description: '',
    deliveryFeeKes: 200,
    ...overrides,
  };
}

const STATIONS: DirectoryStation[] = [
  station({ id: '1', county: 'Nairobi', town: 'Kasarani', deliveryFeeKes: 200 }),
  station({ id: '2', county: 'Nairobi', town: 'Westlands', deliveryFeeKes: 150 }),
  station({ id: '3', county: 'Mombasa', town: 'Nyali', deliveryFeeKes: 350 }),
  station({ id: '4', county: null, town: null, deliveryFeeKes: 400 }),
];

describe('groupStationsByCounty', () => {
  it('counts stations per county and reports the cheapest fee in each', () => {
    const groups = groupStationsByCounty(STATIONS);

    expect(groups).toEqual([
      { county: 'Mombasa', stationCount: 1, fromFeeKes: 350 },
      { county: 'Nairobi', stationCount: 2, fromFeeKes: 150 },
      { county: UNCLASSIFIED_COUNTY, stationCount: 1, fromFeeKes: 400 },
    ]);
  });

  it('keeps unclassified stations visible, always last', () => {
    const groups = groupStationsByCounty(STATIONS);
    expect(groups.at(-1)?.county).toBe(UNCLASSIFIED_COUNTY);
  });

  it('returns nothing for an empty list rather than a bucket of nothing', () => {
    expect(groupStationsByCounty([])).toEqual([]);
  });
});

describe('stationsInCounty', () => {
  it('returns only that county, ordered by town then name', () => {
    const nairobi = stationsInCounty(STATIONS, 'Nairobi');
    expect(nairobi.map((s) => s.town)).toEqual(['Kasarani', 'Westlands']);
  });

  it('reaches the unclassified bucket by its display name', () => {
    expect(stationsInCounty(STATIONS, UNCLASSIFIED_COUNTY).map((s) => s.id)).toEqual(['4']);
  });
});
