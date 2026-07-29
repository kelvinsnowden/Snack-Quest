export interface DeliveryProvider {
  id: string;
  name: string;
  code: string;
  type: 'pudo' | 'courier' | 'on_demand' | 'in_house';
  status: 'active' | 'inactive' | 'beta';
  supports_tracking: boolean;
  estimated_sla: string;
  description: string;
}

export interface PickupStationRecord {
  id: string;
  station_id: string;
  station_code: string;
  station_name: string;
  name: string; // for backward compatibility
  county: string;
  town: string;
  area: string; // for backward compatibility
  delivery_zone: 'Zone 1' | 'Zone 2' | 'Zone 3' | 'Zone 4' | 'Zone 5' | 'Zone 6';
  delivery_zone_id: string;
  physical_address: string;
  address: string;
  latitude: number;
  longitude: number;
  opening_hours: string;
  phone: string;
  status: 'active' | 'inactive';
  is_active: boolean;
  supports_small_package: boolean;
  supports_medium_package: boolean;
  supports_large_package: boolean;
  search_keywords: string[];
  provider_id: string;
  delivery_fee: number; // fee in cents
  delivery_fee_kes: number;
  estimated_delivery_days: number;
  eta_text: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export const DELIVERY_PROVIDERS: DeliveryProvider[] = [
  {
    id: 'jumia',
    name: 'Jumia Pickup Network',
    code: 'JUMIA_PUDO',
    type: 'pudo',
    status: 'active',
    supports_tracking: true,
    estimated_sla: '1-5 Days Nationwide',
    description: 'Self-service pickup stations at 110+ secure locations across Kenya.'
  },
  {
    id: 'glovo',
    name: 'Glovo Express',
    code: 'GLOVO_ON_DEMAND',
    type: 'on_demand',
    status: 'active',
    supports_tracking: true,
    estimated_sla: '2 Hours (Nairobi)',
    description: 'On-demand rapid courier for express urban deliveries.'
  },
  {
    id: 'sendy',
    name: 'Sendy Logistics',
    code: 'SENDY_COURIER',
    type: 'courier',
    status: 'beta',
    supports_tracking: true,
    estimated_sla: 'Same Day / Next Day',
    description: 'Inter-county cargo and doorstep courier fulfillment.'
  },
  {
    id: 'fargo',
    name: 'Fargo Courier',
    code: 'FARGO_EXPRESS',
    type: 'courier',
    status: 'active',
    supports_tracking: true,
    estimated_sla: '24-48 Hours',
    description: 'Secured parcel transport to all major 47 county hubs.'
  },
  {
    id: 'in_house',
    name: 'Snack Quest Rider Fleet',
    code: 'SQ_IN_HOUSE',
    type: 'in_house',
    status: 'active',
    supports_tracking: true,
    estimated_sla: 'Scheduled Same-Day',
    description: 'Dedicated internal electric motorbikes for Nairobi CBD & Westlands VIPs.'
  },
  {
    id: 'uber',
    name: 'Uber Package',
    code: 'UBER_PACKAGE',
    type: 'on_demand',
    status: 'active',
    supports_tracking: true,
    estimated_sla: '45-90 Mins',
    description: 'Direct point-to-point motorcycle delivery.'
  },
  {
    id: 'custom_courier',
    name: 'Custom Courier Partner',
    code: 'CUSTOM_COURIER',
    type: 'courier',
    status: 'active',
    supports_tracking: false,
    estimated_sla: 'Variable',
    description: 'Flexible third-party regional logistics integration.'
  }
];

export const ZONE_PRICING_MATRIX: Record<string, { fee_kes: number; fee_cents: number; eta_days: number; eta_text: string }> = {
  'Zone 1': { fee_kes: 150, fee_cents: 15000, eta_days: 1, eta_text: '1 Business Day' },
  'Zone 2': { fee_kes: 220, fee_cents: 22000, eta_days: 2, eta_text: '1-2 Business Days' },
  'Zone 3': { fee_kes: 280, fee_cents: 28000, eta_days: 2, eta_text: '2 Business Days' },
  'Zone 4': { fee_kes: 350, fee_cents: 35000, eta_days: 3, eta_text: '2-3 Business Days' },
  'Zone 5': { fee_kes: 420, fee_cents: 42000, eta_days: 4, eta_text: '3-4 Business Days' },
  'Zone 6': { fee_kes: 500, fee_cents: 50000, eta_days: 5, eta_text: '5 Business Days' }
};

export const OFFICIAL_ZONES_CONFIG = {
  'Zone 1': {
    counties: ['Nairobi'],
    towns: ['Nairobi', 'CBD', 'Westlands', 'South B', 'Buruburu', 'Adams Arcade', 'Dagoretti', 'Fedha', 'Kayole', 'Utawala', 'Embakasi', 'Mombasa Road', 'Roasters', 'Githurai', 'Huruma', 'Imara Daima', 'Kahawa West', 'Eastleigh', 'Kamulu', 'Karen', 'Kilimani', 'Kasarani', 'Langata', 'Riruta', 'Mbagathi', 'Roysambu', 'Zimmerman', 'Ruai', 'Ruaraka', 'Baba Dogo', 'Mathare', 'Pangani', 'Umoja', 'Komarock', 'Highridge', 'Kangemi']
  },
  'Zone 2': {
    counties: ['Kiambu'],
    towns: ['Kiambu', 'Kitengela', 'Athi River', 'Kikuyu', 'Thika', 'Kangundo', 'Tala', 'Juja', 'Witeithie', 'Kiambu Town', 'Kinoo', 'Ruaka', 'Ruiru', 'Thindigua', 'Wangige', 'Kahawa Sukari', 'Kahawa Wendani', 'Githunguri', 'Makongeni']
  },
  'Zone 3': {
    counties: ['Nakuru', 'Uasin Gishu', 'Murang\'a', 'Nyeri', 'Embu', 'Laikipia', 'Meru', 'Tharaka Nithi', 'Machakos', 'Kajiado', 'Kisumu', 'Nyandarua', 'Nandi', 'Kirinyaga', 'Baringo', 'Elgeyo Marakwet'],
    towns: ['Limuru', 'Naivasha', 'Gilgil', 'Nakuru', 'Kisumu', 'Eldoret', 'Murang\'a', 'Nyeri', 'Karatina', 'Embu', 'Nanyuki', 'Meru', 'Chogoria', 'Maua', 'Kajiado', 'Machakos', 'Masii', 'Kenol', 'Chaka', 'Othaya', 'Ol Kalou', 'Kapsabet', 'Nandi Hills', 'Makutano', 'Nkubu', 'Timau', 'Nyahururu', 'Kagio', 'Kagumo', 'Kerugoya', 'Kutus', 'Mwea', 'Sagana', 'Eldama Ravine', 'Kabarnet', 'Marigat', 'Soy', 'Kondele', 'Awasi', 'Molo', 'Njoro', 'Isinya', 'Kiserian', 'Ngong', 'Ongata Rongai', 'Chuka', 'Moi\'s Bridge', 'Moi University', 'Kesses', 'Barnabas']
  },
  'Zone 4': {
    counties: ['Narok', 'Bomet', 'Kisii', 'Homa Bay', 'Migori', 'Isiolo', 'Kericho', 'Siaya', 'Kakamega', 'Vihiga', 'Nyamira', 'Kwale', 'Kitui', 'Kilifi', 'Mombasa'],
    towns: ['Narok', 'Bomet', 'Sotik', 'Kisii', 'Homa Bay', 'Oyugis', 'Migori', 'Isiolo', 'Kericho', 'Litein', 'Siaya', 'Bondo', 'Maseno', 'Kakamega', 'Luanda', 'Majengo', 'Mbale', 'Nyamira', 'Kilgoris', 'Awendo', 'Rongo', 'Diani', 'Kwale', 'Lungalunga', 'Kitui', 'Mwingi', 'Keroka', 'Ogembo', 'Kilifi', 'Malindi', 'Mazeras', 'Vipingo', 'Watamu', 'Mariakani', 'Mumias', 'Sabatia', 'Mbita', 'Iten', 'Changamwe', 'Mikindani', 'Ganjoni', 'Kisauni', 'Kongowea', 'Likoni', 'Migadini', 'Miritini', 'Mshomoroni', 'Mombasa CBD', 'Mwembe Tayari', 'Tudor', 'Nyali', 'Mtwapa', 'Mutomo', 'Ugunja']
  },
  'Zone 5': {
    counties: ['Trans Nzoia', 'West Pokot', 'Bungoma', 'Busia', 'Makueni', 'Garissa'],
    towns: ['Gatundu', 'Kitale', 'Kapenguria', 'Bungoma', 'Busia', 'Malaba', 'Kehancha', 'Isebania', 'Makueni', 'Emali', 'Kibwezi', 'Loitoktok', 'Garissa', 'Kiminini', 'Kimilili', 'Webuye', 'Mtito Andei', 'Wote']
  },
  'Zone 6': {
    counties: ['Wajir', 'Turkana', 'Tana River', 'Taita Taveta', 'Samburu', 'Lamu', 'Marsabit'],
    towns: ['Wajir', 'Kakuma', 'Lamu', 'Lokichar', 'Lodwar', 'Maralal', 'Mpeketoni', 'Marsabit', 'Hola', 'Wundanyi', 'Mwatate', 'Taveta', 'Voi']
  }
};

export function classifyDeliveryZone(county: string, town: string): 'Zone 1' | 'Zone 2' | 'Zone 3' | 'Zone 4' | 'Zone 5' | 'Zone 6' {
  const normTown = town.trim().toLowerCase();
  const normCounty = county.trim().toLowerCase();

  // Check specific towns first
  for (const [zone, config] of Object.entries(OFFICIAL_ZONES_CONFIG)) {
    if (config.towns.some((t) => t.toLowerCase() === normTown || normTown.includes(t.toLowerCase()))) {
      return zone as any;
    }
  }

  // Check counties
  for (const [zone, config] of Object.entries(OFFICIAL_ZONES_CONFIG)) {
    if (config.counties.some((c) => c.toLowerCase() === normCounty || normCounty.includes(c.toLowerCase()))) {
      return zone as any;
    }
  }

  return 'Zone 3'; // default fallback
}
