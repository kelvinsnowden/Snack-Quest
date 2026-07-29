import { RAW_JUMIA_STATIONS, RawStation } from '../data/rawStations';
import { RAW_JUMIA_STATIONS_PART2 } from '../data/rawStationsPart2';
import { RAW_JUMIA_STATIONS_PART3 } from '../data/rawStationsPart3';
import { RAW_JUMIA_STATIONS_PART4 } from '../data/rawStationsPart4';
import {
  PickupStationRecord,
  DELIVERY_PROVIDERS,
  ZONE_PRICING_MATRIX,
  OFFICIAL_ZONES_CONFIG,
  classifyDeliveryZone,
  DeliveryProvider
} from '../data/deliveryDataset';

// Map raw station descriptions to towns and counties
function inferCountyAndTown(name: string, desc: string): { county: string; town: string } {
  const combined = (name + ' ' + desc).toLowerCase();

  // Known Town -> County mappings
  const townToCountyMap: Record<string, { town: string; county: string }> = {
    'wajir': { town: 'Wajir', county: 'Wajir' },
    'kapenguria': { town: 'Kapenguria', county: 'West Pokot' },
    'luanda': { town: 'Luanda', county: 'Vihiga' },
    'majengo': { town: 'Majengo', county: 'Vihiga' },
    'mbale': { town: 'Mbale', county: 'Vihiga' },
    'kakuma': { town: 'Kakuma', county: 'Turkana' },
    'lodwar': { town: 'Lodwar', county: 'Turkana' },
    'lokichar': { town: 'Lokichar', county: 'Turkana' },
    'kiminini': { town: 'Kiminini', county: 'Trans Nzoia' },
    'kitale': { town: 'Kitale', county: 'Trans Nzoia' },
    'moi\'s bridge': { town: 'Moi\'s Bridge', county: 'Trans Nzoia' },
    'moisbridge': { town: 'Moi\'s Bridge', county: 'Trans Nzoia' },
    'chogoria': { town: 'Chogoria', county: 'Tharaka Nithi' },
    'chuka': { town: 'Chuka', county: 'Tharaka Nithi' },
    'hola': { town: 'Hola', county: 'Tana River' },
    'mwatate': { town: 'Mwatate', county: 'Taita Taveta' },
    'taveta': { town: 'Taveta', county: 'Taita Taveta' },
    'voi': { town: 'Voi', county: 'Taita Taveta' },
    'wundanyi': { town: 'Wundanyi', county: 'Taita Taveta' },
    'bondo': { town: 'Bondo', county: 'Siaya' },
    'siaya': { town: 'Siaya', county: 'Siaya' },
    'ugunja': { town: 'Ugunja', county: 'Siaya' },
    'maralal': { town: 'Maralal', county: 'Samburu' },
    'chaka': { town: 'Chaka', county: 'Nyeri' },
    'karatina': { town: 'Karatina', county: 'Nyeri' },
    'nyeri': { town: 'Nyeri', county: 'Nyeri' },
    'othaya': { town: 'Othaya', county: 'Nyeri' },
    'olkalou': { town: 'Ol Kalou', county: 'Nyandarua' },
    'nyamira': { town: 'Nyamira', county: 'Nyamira' },
    'kilgoris': { town: 'Kilgoris', county: 'Narok' },
    'kilgolis': { town: 'Kilgoris', county: 'Narok' },
    'narok': { town: 'Narok', county: 'Narok' },
    'kapsabet': { town: 'Kapsabet', county: 'Nandi' },
    'nandi hills': { town: 'Nandi Hills', county: 'Nandi' },
    'kenol': { town: 'Kenol', county: 'Murang\'a' },
    'muranga': { town: 'Murang\'a', county: 'Murang\'a' },
    'murang\'a': { town: 'Murang\'a', county: 'Murang\'a' },
    'awendo': { town: 'Awendo', county: 'Migori' },
    'isebania': { town: 'Isebania', county: 'Migori' },
    'kehancha': { town: 'Kehancha', county: 'Migori' },
    'migori': { town: 'Migori', county: 'Migori' },
    'rongo': { town: 'Rongo', county: 'Migori' },
    'makutano': { town: 'Makutano', county: 'Meru' },
    'maua': { town: 'Maua', county: 'Meru' },
    'meru': { town: 'Meru', county: 'Meru' },
    'nkubu': { town: 'Nkubu', county: 'Meru' },
    'timau': { town: 'Timau', county: 'Meru' },
    'emali': { town: 'Emali', county: 'Makueni' },
    'kibwezi': { town: 'Kibwezi', county: 'Makueni' },
    'mtito andei': { town: 'Mtito Andei', county: 'Makueni' },
    'wote': { town: 'Wote', county: 'Makueni' },
    'lamu': { town: 'Lamu', county: 'Lamu' },
    'nanyuki': { town: 'Nanyuki', county: 'Laikipia' },
    'nyahururu': { town: 'Nyahururu', county: 'Laikipia' },
    'diani': { town: 'Diani', county: 'Kwale' },
    'kwale': { town: 'Kwale', county: 'Kwale' },
    'lungalunga': { town: 'Lungalunga', county: 'Kwale' },
    'kitui': { town: 'Kitui', county: 'Kitui' },
    'mwingi': { town: 'Mwingi', county: 'Kitui' },
    'mutomo': { town: 'Mutomo', county: 'Kitui' },
    'keroka': { town: 'Keroka', county: 'Kisii' },
    'kisii': { town: 'Kisii', county: 'Kisii' },
    'ogembo': { town: 'Ogembo', county: 'Kisii' },
    'kagio': { town: 'Kagio', county: 'Kirinyaga' },
    'kagumo': { town: 'Kagumo', county: 'Kirinyaga' },
    'kerugoya': { town: 'Kerugoya', county: 'Kirinyaga' },
    'kutus': { town: 'Kutus', county: 'Kirinyaga' },
    'mwea': { town: 'Mwea', county: 'Kirinyaga' },
    'sagana': { town: 'Sagana', county: 'Kirinyaga' },
    'kilifi': { town: 'Kilifi', county: 'Kilifi' },
    'malindi': { town: 'Malindi', county: 'Kilifi' },
    'mazeras': { town: 'Mazeras', county: 'Kilifi' },
    'vipingo': { town: 'Vipingo', county: 'Kilifi' },
    'watamu': { town: 'Watamu', county: 'Kilifi' },
    'mariakani': { town: 'Mariakani', county: 'Kilifi' },
    'kericho': { town: 'Kericho', county: 'Kericho' },
    'litein': { town: 'Litein', county: 'Kericho' },
    'kakamega': { town: 'Kakamega', county: 'Kakamega' },
    'mumias': { town: 'Mumias', county: 'Kakamega' },
    'sabatia': { town: 'Sabatia', county: 'Kakamega' },
    'isiolo': { town: 'Isiolo', county: 'Isiolo' },
    'homabay': { town: 'Homa Bay', county: 'Homa Bay' },
    'homa bay': { town: 'Homa Bay', county: 'Homa Bay' },
    'mbita': { town: 'Mbita', county: 'Homa Bay' },
    'oyugis': { town: 'Oyugis', county: 'Homa Bay' },
    'embu': { town: 'Embu', county: 'Embu' },
    'iten': { town: 'Iten', county: 'Elgeyo Marakwet' },
    'malaba': { town: 'Malaba', county: 'Busia' },
    'busia': { town: 'Busia', county: 'Busia' },
    'kimilili': { town: 'Kimilili', county: 'Bungoma' },
    'webuye': { town: 'Webuye', county: 'Bungoma' },
    'bungoma': { town: 'Bungoma', county: 'Bungoma' },
    'bomet': { town: 'Bomet', county: 'Bomet' },
    'sotik': { town: 'Sotik', county: 'Bomet' },
    'eldama ravine': { town: 'Eldama Ravine', county: 'Baringo' },
    'kabarnet': { town: 'Kabarnet', county: 'Baringo' },
    'marigat': { town: 'Marigat', county: 'Baringo' },
    'eldoret': { town: 'Eldoret', county: 'Uasin Gishu' },
    'soy': { town: 'Soy', county: 'Uasin Gishu' },
    'kesses': { town: 'Kesses', county: 'Uasin Gishu' },
    'moi university': { town: 'Moi University', county: 'Uasin Gishu' },
    'south b': { town: 'South B', county: 'Nairobi' },
    'buruburu': { town: 'Buruburu', county: 'Nairobi' },
    'adams arcade': { town: 'Adams Arcade', county: 'Nairobi' },
    'dagoretti': { town: 'Dagoretti', county: 'Nairobi' },
    'ronald ngala': { town: 'CBD', county: 'Nairobi' },
    'kimathi': { town: 'CBD', county: 'Nairobi' },
    'cbd': { town: 'CBD', county: 'Nairobi' },
    'fedha': { town: 'Fedha', county: 'Nairobi' },
    'kayole': { town: 'Kayole', county: 'Nairobi' },
    'utawala': { town: 'Utawala', county: 'Nairobi' },
    'embakasi': { town: 'Embakasi', county: 'Nairobi' },
    'roasters': { town: 'Roasters', county: 'Nairobi' },
    'githurai': { town: 'Githurai', county: 'Nairobi' },
    'huruma': { town: 'Huruma', county: 'Nairobi' },
    'imara daima': { town: 'Imara Daima', county: 'Nairobi' },
    'eastleigh': { town: 'Eastleigh', county: 'Nairobi' },
    'kamulu': { town: 'Kamulu', county: 'Nairobi' },
    'karen': { town: 'Karen', county: 'Nairobi' },
    'kilimani': { town: 'Kilimani', county: 'Nairobi' },
    'kasarani': { town: 'Kasarani', county: 'Nairobi' },
    'langata': { town: 'Langata', county: 'Nairobi' },
    'riruta': { town: 'Riruta', county: 'Nairobi' },
    'mbagathi': { town: 'Mbagathi', county: 'Nairobi' },
    'roysambu': { town: 'Roysambu', county: 'Nairobi' },
    'zimmerman': { town: 'Zimmerman', county: 'Nairobi' },
    'ruai': { town: 'Ruai', county: 'Nairobi' },
    'ruaraka': { town: 'Ruaraka', county: 'Nairobi' },
    'babadogo': { town: 'Baba Dogo', county: 'Nairobi' },
    'mathare': { town: 'Mathare', county: 'Nairobi' },
    'pangani': { town: 'Pangani', county: 'Nairobi' },
    'umoja': { town: 'Umoja', county: 'Nairobi' },
    'komarock': { town: 'Komarock', county: 'Nairobi' },
    'westlands': { town: 'Westlands', county: 'Nairobi' },
    'highridge': { town: 'Highridge', county: 'Nairobi' },
    'kangemi': { town: 'Kangemi', county: 'Nairobi' },
    'gatundu': { town: 'Gatundu', county: 'Kiambu' },
    'githunguri': { town: 'Githunguri', county: 'Kiambu' },
    'juja': { town: 'Juja', county: 'Kiambu' },
    'witeithie': { town: 'Witeithie', county: 'Kiambu' },
    'kiambu': { town: 'Kiambu', county: 'Kiambu' },
    'kikuyu': { town: 'Kikuyu', county: 'Kiambu' },
    'kinoo': { town: 'Kinoo', county: 'Kiambu' },
    'limuru': { town: 'Limuru', county: 'Kiambu' },
    'ruaka': { town: 'Ruaka', county: 'Kiambu' },
    'ruiru': { town: 'Ruiru', county: 'Kiambu' },
    'thika': { town: 'Thika', county: 'Kiambu' },
    'thindigua': { town: 'Thindigua', county: 'Kiambu' },
    'wangige': { town: 'Wangige', county: 'Kiambu' },
    'isinya': { town: 'Isinya', county: 'Kajiado' },
    'kajiado': { town: 'Kajiado', county: 'Kajiado' },
    'kiserian': { town: 'Kiserian', county: 'Kajiado' },
    'kitengela': { town: 'Kitengela', county: 'Kajiado' },
    'loitoktok': { town: 'Loitoktok', county: 'Kajiado' },
    'ngong': { town: 'Ngong', county: 'Kajiado' },
    'ongata rongai': { town: 'Ongata Rongai', county: 'Kajiado' },
    'rongai': { town: 'Ongata Rongai', county: 'Kajiado' },
    'awasi': { town: 'Awasi', county: 'Kisumu' },
    'kisumu': { town: 'Kisumu', county: 'Kisumu' },
    'maseno': { town: 'Maseno', county: 'Kisumu' },
    'kondele': { town: 'Kondele', county: 'Kisumu' },
    'gilgil': { town: 'Gilgil', county: 'Nakuru' },
    'barnabas': { town: 'Barnabas', county: 'Nakuru' },
    'molo': { town: 'Molo', county: 'Nakuru' },
    'naivasha': { town: 'Naivasha', county: 'Nakuru' },
    'nakuru': { town: 'Nakuru', county: 'Nakuru' },
    'njoro': { town: 'Njoro', county: 'Nakuru' },
    'changamwe': { town: 'Changamwe', county: 'Mombasa' },
    'mikindani': { town: 'Mikindani', county: 'Mombasa' },
    'ganjoni': { town: 'Ganjoni', county: 'Mombasa' },
    'kisauni': { town: 'Kisauni', county: 'Mombasa' },
    'kongowea': { town: 'Kongowea', county: 'Mombasa' },
    'likoni': { town: 'Likoni', county: 'Mombasa' },
    'migadini': { town: 'Migadini', county: 'Mombasa' },
    'miritini': { town: 'Miritini', county: 'Mombasa' },
    'mshomoroni': { town: 'Mshomoroni', county: 'Mombasa' },
    'mombasa': { town: 'Mombasa CBD', county: 'Mombasa' },
    'tudor': { town: 'Tudor', county: 'Mombasa' },
    'nyali': { town: 'Nyali', county: 'Mombasa' },
    'mtwapa': { town: 'Mtwapa', county: 'Kilifi' }
  };

  for (const [key, val] of Object.entries(townToCountyMap)) {
    if (combined.includes(key)) {
      return { county: val.county, town: val.town };
    }
  }

  return { county: 'Nairobi', town: 'Nairobi CBD' };
}

// Global Normalized Station Records initialized at startup
const ALL_RAW_STATIONS: RawStation[] = [
  ...RAW_JUMIA_STATIONS,
  ...RAW_JUMIA_STATIONS_PART2,
  ...RAW_JUMIA_STATIONS_PART3,
  ...RAW_JUMIA_STATIONS_PART4
];

export function buildNormalizedStationRecords(): PickupStationRecord[] {
  return ALL_RAW_STATIONS.map((raw, idx) => {
    const { county, town } = inferCountyAndTown(raw.station_name, raw.description);
    const zone = classifyDeliveryZone(county, town);
    const pricing = ZONE_PRICING_MATRIX[zone];
    const stationCode = `SQ-JUMIA-${(idx + 1).toString().padStart(3, '0')}`;
    const id = `stn-${(idx + 1).toString().padStart(3, '0')}`;

    // Extract hours and clean address from description
    const descLines = raw.description.split('\n').map((l) => l.trim()).filter(Boolean);
    const address = descLines[0] || raw.description.replace(/\n/g, ', ');
    const hours = descLines.slice(1).join(' | ') || 'Mon-Fri (08:00am-6:00pm) | Sat (09:00am-1:00pm)';

    const searchKeywords = Array.from(
      new Set([
        raw.station_name.toLowerCase(),
        town.toLowerCase(),
        county.toLowerCase(),
        zone.toLowerCase(),
        address.toLowerCase(),
        'jumia',
        'pickup station',
        'pudo'
      ])
    );

    return {
      id,
      station_id: id,
      station_code: stationCode,
      station_name: raw.station_name,
      name: raw.station_name,
      county,
      town,
      area: town,
      delivery_zone: zone,
      delivery_zone_id: zone.toLowerCase().replace(/\s+/g, '_'),
      physical_address: address,
      address,
      latitude: raw.latitude,
      longitude: raw.longitude,
      opening_hours: hours,
      phone: '+254 700 000 000',
      status: 'active',
      is_active: true,
      supports_small_package: true,
      supports_medium_package: true,
      supports_large_package: true,
      search_keywords: searchKeywords,
      provider_id: 'jumia',
      delivery_fee: pricing.fee_cents,
      delivery_fee_kes: pricing.fee_kes,
      estimated_delivery_days: pricing.eta_days,
      eta_text: pricing.eta_text,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
}

export class DeliveryIntelligenceService {
  private stations: PickupStationRecord[] = [];

  constructor() {
    this.stations = buildNormalizedStationRecords();
  }

  public getStations(): PickupStationRecord[] {
    return this.stations;
  }

  public getProviders(): DeliveryProvider[] {
    return DELIVERY_PROVIDERS;
  }

  public getZonePricingMatrix() {
    return ZONE_PRICING_MATRIX;
  }

  public getCountyTownRegistry() {
    return OFFICIAL_ZONES_CONFIG;
  }

  public queryPickupStations(params: {
    query?: string;
    county?: string;
    town?: string;
    zone?: string;
    provider?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    let result = [...this.stations];

    if (params.query) {
      const q = params.query.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.station_name.toLowerCase().includes(q) ||
          s.town.toLowerCase().includes(q) ||
          s.county.toLowerCase().includes(q) ||
          s.physical_address.toLowerCase().includes(q) ||
          s.station_code.toLowerCase().includes(q) ||
          s.search_keywords.some((k) => k.includes(q))
      );
    }

    if (params.county && params.county !== 'All') {
      result = result.filter((s) => s.county.toLowerCase() === params.county!.toLowerCase());
    }

    if (params.town && params.town !== 'All') {
      result = result.filter((s) => s.town.toLowerCase() === params.town!.toLowerCase());
    }

    if (params.zone && params.zone !== 'All') {
      result = result.filter((s) => s.delivery_zone.toLowerCase() === params.zone!.toLowerCase());
    }

    if (params.provider && params.provider !== 'All') {
      result = result.filter((s) => s.provider_id.toLowerCase() === params.provider!.toLowerCase());
    }

    if (params.status) {
      result = result.filter((s) => s.status === params.status);
    }

    const page = params.page || 1;
    const limit = params.limit || 1000;
    const totalCount = result.length;
    const totalPages = Math.ceil(totalCount / limit);
    const paginated = result.slice((page - 1) * limit, page * limit);

    return {
      stations: paginated,
      meta: {
        total_records: totalCount,
        page,
        limit,
        total_pages: totalPages,
        zones_breakdown: this.getZonesBreakdown(result),
        counties_count: new Set(result.map((s) => s.county)).size,
        towns_count: new Set(result.map((s) => s.town)).size
      }
    };
  }

  public getStationById(id: string): PickupStationRecord | undefined {
    return this.stations.find((s) => s.id === id || s.station_id === id || s.station_code === id);
  }

  public calculateDeliveryQuote(params: {
    county: string;
    town: string;
    pickup_station_id?: string;
    weight_kg?: number;
    item_count?: number;
    promo_code?: string;
    provider_id?: string;
  }) {
    const zone = classifyDeliveryZone(params.county, params.town);
    const matrix = ZONE_PRICING_MATRIX[zone];

    const baseFeeKes = matrix.fee_kes;
    let weightSurchargeKes = 0;
    const weight = params.weight_kg || 1;

    // Small package matrix: Up to 3kg base, 50 KES per extra kg
    if (weight > 3) {
      weightSurchargeKes = Math.ceil(weight - 3) * 50;
    }

    let discountKes = 0;
    if (params.promo_code && params.promo_code.toUpperCase() === 'SNACK25') {
      discountKes = Math.round((baseFeeKes + weightSurchargeKes) * 0.25);
    }

    const finalFeeKes = Math.max(0, baseFeeKes + weightSurchargeKes - discountKes);
    const finalFeeCents = finalFeeKes * 100;

    return {
      county: params.county,
      town: params.town,
      delivery_zone: zone,
      pricing_matrix_applied: 'Small Package Matrix',
      base_fee_kes: baseFeeKes,
      weight_kg: weight,
      weight_surcharge_kes: weightSurchargeKes,
      discount_kes: discountKes,
      total_delivery_fee_kes: finalFeeKes,
      total_delivery_fee_cents: finalFeeCents,
      estimated_days: matrix.eta_days,
      eta_text: matrix.eta_text,
      provider: params.provider_id || 'jumia',
      guaranteed_by: new Date(Date.now() + matrix.eta_days * 86400000).toLocaleDateString('en-KE', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    };
  }

  public importCustomPickupStations(records: Partial<PickupStationRecord>[]) {
    let imported = 0;
    records.forEach((rec) => {
      if (!rec.station_name) return;
      const id = rec.id || `stn-custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const county = rec.county || 'Nairobi';
      const town = rec.town || 'Nairobi CBD';
      const zone = rec.delivery_zone || classifyDeliveryZone(county, town);
      const pricing = ZONE_PRICING_MATRIX[zone];

      const newRecord: PickupStationRecord = {
        id,
        station_id: id,
        station_code: rec.station_code || `SQ-CUST-${imported + 1}`,
        station_name: rec.station_name,
        name: rec.station_name,
        county,
        town,
        area: town,
        delivery_zone: zone,
        delivery_zone_id: zone.toLowerCase().replace(/\s+/g, '_'),
        physical_address: rec.physical_address || rec.address || 'Custom Address',
        address: rec.physical_address || rec.address || 'Custom Address',
        latitude: rec.latitude || -1.286389,
        longitude: rec.longitude || 36.817223,
        opening_hours: rec.opening_hours || 'Mon-Fri (08:00am-6:00pm)',
        phone: rec.phone || '+254 700 000 000',
        status: rec.status || 'active',
        is_active: rec.is_active !== undefined ? rec.is_active : true,
        supports_small_package: true,
        supports_medium_package: true,
        supports_large_package: true,
        search_keywords: [rec.station_name.toLowerCase(), town.toLowerCase(), county.toLowerCase()],
        provider_id: rec.provider_id || 'jumia',
        delivery_fee: pricing.fee_cents,
        delivery_fee_kes: pricing.fee_kes,
        estimated_delivery_days: pricing.eta_days,
        eta_text: pricing.eta_text,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const existingIdx = this.stations.findIndex((s) => s.id === id || s.station_name === rec.station_name);
      if (existingIdx >= 0) {
        this.stations[existingIdx] = newRecord;
      } else {
        this.stations.unshift(newRecord);
      }
      imported++;
    });

    return {
      status: 'success',
      imported_count: imported,
      total_active_stations: this.stations.length
    };
  }

  private getZonesBreakdown(items: PickupStationRecord[]) {
    const counts: Record<string, number> = {
      'Zone 1': 0,
      'Zone 2': 0,
      'Zone 3': 0,
      'Zone 4': 0,
      'Zone 5': 0,
      'Zone 6': 0
    };
    items.forEach((s) => {
      if (counts[s.delivery_zone] !== undefined) {
        counts[s.delivery_zone]++;
      }
    });
    return counts;
  }
}

export const deliveryService = new DeliveryIntelligenceService();
