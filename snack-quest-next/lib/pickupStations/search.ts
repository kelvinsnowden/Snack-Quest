/**
 * Pure pickup-station search/ranking logic — no Firestore, no I/O
 * (same discipline as `lib/conversation/stateMachine.ts`). The
 * Repository fetches candidate stations; this module decides which
 * ones match a customer's free-text query ("Kasarani", "Eldoret",
 * "Nairobi CBD") and in what order.
 *
 * At today's real scale (one business, ~209 stations nationwide) an
 * in-memory scoring pass over every active station is genuinely fast
 * — sub-millisecond. This is the scaling boundary worth naming
 * honestly: it stops being the right approach somewhere around tens
 * of thousands of stations or many tenants each with large catalogs,
 * where a real search index (Algolia/Typesense/Firestore's own
 * full-text extensions) would replace this — not a concern today.
 */

export interface SearchableStation {
  id: string;
  name: string;
  county: string | null;
  town: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Classic edit distance — used only as a last-resort typo-tolerance fallback. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

export function scoreStation(query: string, station: SearchableStation): number {
  const q = normalize(query);
  if (!q) {
    return 0;
  }

  const county = station.county ? normalize(station.county) : '';
  const town = station.town ? normalize(station.town) : '';
  const name = normalize(station.name);

  let score = 0;
  if (county === q) score += 5;
  else if (county && county.includes(q)) score += 3;

  if (town === q) score += 5;
  else if (town && town.includes(q)) score += 4;

  if (name.includes(q)) score += 2;

  // Fuzzy fallback only when nothing matched exactly/by substring —
  // catches typos ("Kasarni") without letting fuzzy noise outrank a
  // real substring match on a different, correctly-spelled field.
  if (score === 0) {
    for (const candidate of [town, county]) {
      if (candidate && Math.abs(candidate.length - q.length) <= 2 && levenshtein(candidate, q) <= 2) {
        score += 1;
        break;
      }
    }
  }

  return score;
}

export function searchStations<T extends SearchableStation>(
  query: string,
  stations: T[],
  limit = 8,
): T[] {
  return stations
    .map((station) => ({ station, score: scoreStation(query, station) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.station);
}
