import { describe, expect, it } from 'vitest';
import { scoreStation, searchStations, type SearchableStation } from '@/lib/pickupStations/search';

const STATIONS: SearchableStation[] = [
  { id: 'kasarani-1', name: 'G4S Kasarani Station', county: 'Nairobi', town: 'Kasarani' },
  { id: 'kasarani-2', name: 'Naivas Kasarani Mwiki', county: 'Nairobi', town: 'Kasarani' },
  { id: 'eldoret-1', name: 'G4S Eldoret Station', county: 'Uasin Gishu', town: 'Eldoret' },
  { id: 'eldoret-2', name: 'Naivas Eldoret Town', county: 'Uasin Gishu', town: 'Eldoret' },
  { id: 'mombasa-1', name: 'G4S Mombasa Nyali', county: 'Mombasa', town: 'Nyali' },
  { id: 'unmapped-1', name: 'Fortify Solutions', county: null, town: null },
];

describe('searchStations', () => {
  it('finds every Kasarani station by town name', () => {
    const results = searchStations('Kasarani', STATIONS);
    expect(results.map((r) => r.id).sort()).toEqual(['kasarani-1', 'kasarani-2']);
  });

  it('finds every Eldoret station by town name', () => {
    const results = searchStations('Eldoret', STATIONS);
    expect(results.map((r) => r.id).sort()).toEqual(['eldoret-1', 'eldoret-2']);
  });

  it('searches by county', () => {
    const results = searchStations('Mombasa', STATIONS);
    expect(results.map((r) => r.id)).toEqual(['mombasa-1']);
  });

  it('searches by station name substring', () => {
    const results = searchStations('Nyali', STATIONS);
    expect(results.map((r) => r.id)).toEqual(['mombasa-1']);
  });

  it('ranks an exact town match above a substring county match', () => {
    const ambiguous: SearchableStation[] = [
      { id: 'exact-town', name: 'Some Station', county: 'Nairobi', town: 'Kisumu' },
      { id: 'substring-county', name: 'Other Station', county: 'Kisumu East', town: 'Ahero' },
    ];
    const results = searchStations('Kisumu', ambiguous);
    expect(results[0].id).toBe('exact-town');
  });

  it('tolerates a small typo via the fuzzy fallback', () => {
    const results = searchStations('Kasarni', STATIONS);
    expect(results.map((r) => r.id).sort()).toEqual(['kasarani-1', 'kasarani-2']);
  });

  it('returns no matches for a query with nothing close', () => {
    const results = searchStations('Zzzznotarealplace', STATIONS);
    expect(results).toEqual([]);
  });

  it('never matches a station with null county/town on an unrelated fuzzy query', () => {
    const results = searchStations('Kasarani', [STATIONS[5]]);
    expect(results).toEqual([]);
  });

  it('scores an exact county/town match higher than a substring match', () => {
    const exactTown = scoreStation('kasarani', { id: 'a', name: 'x', county: null, town: 'Kasarani' });
    const substringTown = scoreStation('kasarani', {
      id: 'b',
      name: 'x',
      county: null,
      town: 'Kasarani Mwiki',
    });
    expect(exactTown).toBeGreaterThan(substringTown);
  });

  it('respects the limit parameter', () => {
    const many: SearchableStation[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      name: `Kasarani Station ${i}`,
      county: 'Nairobi',
      town: 'Kasarani',
    }));
    const results = searchStations('Kasarani', many, 5);
    expect(results).toHaveLength(5);
  });
});
