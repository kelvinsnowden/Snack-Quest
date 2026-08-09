/**
 * Jumia's real pickup-delivery zones and the rate Snack Quest actually
 * pays (§ pickup delivery pricing). Replaces the placeholder scheme
 * where every county was its own "zone" priced at `null` — which is
 * why every pickup order until now shipped with free delivery.
 *
 * Two things fix the rate to a single column of Jumia's table:
 *
 *   Origin is always Nairobi, which is Zone 1. Snack Quest ships from
 *   one place (`DeliveryDetails.shippingOrigin`), so only the
 *   `Zone 1 -> N` row of the matrix is ever consulted. The reverse
 *   direction and every other origin pairing exist in Jumia's card but
 *   are not situations this business is in.
 *
 *   Every box is a small package. The largest Snack Quest box is
 *   400 x 300 x 120mm, comfortably inside the 600 x 400 x 200mm and
 *   5kg small-package ceiling, so the medium and large columns never
 *   apply. If a box ever outgrows that, this is the file that changes
 *   — and it should change deliberately, not by a size field silently
 *   picking a more expensive column.
 *
 * The zone is a commercial classification, NOT a distance band. That
 * is worth stating because it looks like one and isn't: Gatundu is
 * 32km from Nairobi and sits in Zone 5, while Nakuru at 160km is
 * Zone 3, and Zones 3 through 6 overlap almost completely by road
 * distance. Nothing may infer a zone from coordinates.
 */

export const JUMIA_ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6'] as const;

export type JumiaZone = (typeof JUMIA_ZONES)[number];

export const SHIPPING_ORIGIN_ZONE: JumiaZone = 'Zone 1';

/**
 * Small-package fee for a Nairobi (Zone 1) origin, per destination
 * zone. Transcribed from Jumia's published rate card; the figures a
 * real customer is charged, so they are stated once here and read
 * everywhere else.
 */
export const SMALL_PACKAGE_FEE_FROM_NAIROBI_KES: Record<JumiaZone, number> = {
  'Zone 1': 160,
  'Zone 2': 200,
  'Zone 3': 250,
  'Zone 4': 300,
  'Zone 5': 400,
  'Zone 6': 450,
};

/** Jumia's published delivery window, in business days, from Nairobi to each zone. Displayed, never used for pricing. */
export const DELIVERY_DAYS_FROM_NAIROBI: Record<JumiaZone, number> = {
  'Zone 1': 1,
  'Zone 2': 1,
  'Zone 3': 3,
  'Zone 4': 3,
  'Zone 5': 4,
  'Zone 6': 5,
};

/**
 * The localities Jumia names for each zone, verbatim.
 *
 * Deliberately NOT extended with towns that seem nearby: this list is
 * the whole of what the courier has actually told us, and a station in
 * a town it doesn't name has an unknown zone, not a guessable one.
 * `resolveZoneForLocality` returns null for those on purpose — see
 * `scripts/assignPickupStationZones.mjs`, which leaves them for a human
 * to assign rather than inventing a fee.
 */
export const ZONE_LOCALITIES: Record<JumiaZone, string[]> = {
  'Zone 1': ['Nairobi'],
  'Zone 2': ['Kitengela', 'Kiambu', 'Athi River', 'Kikuyu', 'Thika', 'Kangundo', 'Tala'],
  'Zone 3': [
    'Limuru',
    'Naivasha',
    'Gilgil',
    'Nakuru',
    'Kisumu',
    'Eldoret',
    'Muranga',
    "Murang'a",
    'Nyeri',
    'Karatina',
    'Embu',
    'Nanyuki',
    'Meru',
    'Chogoria',
    'Maua',
    'Kajiado',
    'Machakos',
    'Masii',
    'Kenol',
  ],
  'Zone 4': [
    'Narok',
    'Bomet',
    'Sotik',
    'Kisii',
    'Homabay',
    'Homa Bay',
    'Oyugis',
    'Migori',
    'Isiolo',
    'Kericho',
    'Litein',
    'Siaya',
    'Bondo',
    'Maseno',
    'Kakamega',
  ],
  'Zone 5': [
    'Gatundu',
    'Kitale',
    'Kapenguria',
    'Bungoma',
    'Busia',
    'Malaba',
    'Kehancha',
    'Isebania',
    'Makueni',
    'Emali',
    'Kibwezi',
    'Loitoktok',
    'Garissa',
  ],
  'Zone 6': [
    'Wajir',
    'Kakuma',
    'Lamu',
    'Lokichar',
    'Lodwar',
    'Maralal',
    'Mpeketoni',
    'Marsabit',
    'Hola',
    'Wundanyi',
  ],
};

function normalize(value: string | null | undefined): string {
  // Station towns carry disambiguating suffixes like "Majengo (Kisumu)";
  // the parenthetical is our own annotation, not part of the place name.
  return (value ?? '')
    .replace(/\(.*?\)/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const LOCALITY_TO_ZONE: Map<string, JumiaZone> = new Map(
  Object.entries(ZONE_LOCALITIES).flatMap(([zone, localities]) =>
    localities.map((locality) => [normalize(locality), zone as JumiaZone] as const),
  ),
);

/**
 * The zone for a station, or null when Jumia's published list doesn't
 * cover it. Null is a real answer meaning "ask the courier", never a
 * cue to fall back to a default.
 *
 * The whole of Nairobi county is Zone 1 — that one is safe to widen
 * beyond the literal locality, because "Nairobi" in the zone table
 * means the city, and every station our geography data places in
 * Nairobi county is in it.
 */
export function resolveZoneForLocality(
  town: string | null | undefined,
  county: string | null | undefined,
): JumiaZone | null {
  if (normalize(county) === 'nairobi') {
    return 'Zone 1';
  }
  return LOCALITY_TO_ZONE.get(normalize(town)) ?? null;
}

export function isJumiaZone(value: string | null | undefined): value is JumiaZone {
  return (JUMIA_ZONES as readonly string[]).includes(value ?? '');
}

/** What a station in this zone costs to ship to from Nairobi, for a Snack Quest box. */
export function feeForZoneKes(zone: JumiaZone): number {
  return SMALL_PACKAGE_FEE_FROM_NAIROBI_KES[zone];
}
