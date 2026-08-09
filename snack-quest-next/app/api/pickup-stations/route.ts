import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import {
  groupStationsByCounty,
  stationsInCounty,
  type DirectoryStation,
} from '@/lib/pickupStations/directory';

/**
 * `GET /api/pickup-stations` (§ Website Becomes the Primary Commerce
 * Channel) — the station picker's read model, in three modes:
 *
 *   (no params)     → the county list, with a station count and a
 *                     "from" fee each
 *   ?county=Nairobi → every station in that county
 *   ?q=kasarani     → free-text search across the whole country
 *
 * County-first because the requirement is explicitly a browseable
 * interface rather than one long dropdown of 200+ stations. Search is
 * the same `pickupStationRepository.search` the WhatsApp flow uses —
 * one ranking implementation, not a second one for the web.
 *
 * Public and read-only: this is the same station list printed on
 * every courier's own website. Cached at the edge for five minutes
 * because station data changes when someone runs a seed script, not
 * per request.
 */
const CACHE_HEADERS = { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' };

const SEARCH_LIMIT = 12;

function toDirectoryStation(entry: {
  id: string;
  data: { name: string; county: string | null; town: string | null; description: string; deliveryFeeKes: number };
}): DirectoryStation {
  return {
    id: entry.id,
    name: entry.data.name,
    county: entry.data.county,
    town: entry.data.town,
    description: entry.data.description,
    deliveryFeeKes: entry.data.deliveryFeeKes,
  };
}

export async function GET(request: Request): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim();
  const county = params.get('county')?.trim();

  if (query) {
    const matches = await pickupStationRepository.search(businessId, query, SEARCH_LIMIT);
    return Response.json({ stations: matches.map(toDirectoryStation) }, { headers: CACHE_HEADERS });
  }

  const active = (await pickupStationRepository.listActive(businessId)).map(toDirectoryStation);

  if (county) {
    return Response.json({ stations: stationsInCounty(active, county) }, { headers: CACHE_HEADERS });
  }

  return Response.json({ counties: groupStationsByCounty(active) }, { headers: CACHE_HEADERS });
}
