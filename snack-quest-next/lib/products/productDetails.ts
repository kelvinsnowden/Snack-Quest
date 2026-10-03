/**
 * Product details staff copy off the pack (§ PRODUCT DATA MODEL): brand,
 * barcode, allergens and net content. Plain data and pure functions, so
 * the Admin form, the API and the machine screen read one definition.
 *
 * The system records what the pack says; it never infers an allergen.
 * "Not recorded" (absent) and "declared none" (an empty list) are kept
 * apart, because the second is a claim and the first is not.
 */

/** The allergens food labels commonly declare (the EU/UK fourteen, which imported snacks usually carry). */
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  peanuts: 'Peanuts',
  soy: 'Soy',
  milk: 'Milk',
  tree_nuts: 'Tree nuts',
  celery: 'Celery',
  mustard: 'Mustard',
  sesame: 'Sesame',
  sulphites: 'Sulphites',
  lupin: 'Lupin',
  molluscs: 'Molluscs',
};

export const NET_CONTENT_UNITS = ['g', 'ml'] as const;
export type NetContentUnit = (typeof NET_CONTENT_UNITS)[number];

export interface NetContent {
  amount: number;
  unit: NetContentUnit;
}

/** GTIN lengths: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GTIN = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;

/** True when `code` is a GTIN whose check digit is right — catches the usual one-digit typo. */
export function isValidBarcode(code: string): boolean {
  if (!GTIN.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  // From the right, weights alternate 3, 1, 3, …
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export interface DetailsPatch {
  brand?: string | null;
  barcode?: string | null;
  allergens?: Allergen[] | null;
  netContent?: NetContent | null;
}

/**
 * Reads the four fields from a request body. A key that is absent stays
 * absent (an update leaves it alone); `null` or an empty string clears
 * it. Returns the first problem as `error`.
 */
export function parseProductDetails(body: Record<string, unknown>): { details: DetailsPatch } | { error: string } {
  const details: DetailsPatch = {};

  if ('brand' in body) {
    const brand = body.brand;
    if (brand === null || (typeof brand === 'string' && brand.trim() === '')) details.brand = null;
    else if (typeof brand === 'string' && brand.trim().length <= 80) details.brand = brand.trim();
    else return { error: 'brand must be text of at most 80 characters' };
  }

  if ('barcode' in body) {
    const barcode = body.barcode;
    if (barcode === null || (typeof barcode === 'string' && barcode.trim() === '')) details.barcode = null;
    else if (typeof barcode === 'string' && isValidBarcode(barcode.replace(/\s/g, ''))) details.barcode = barcode.replace(/\s/g, '');
    else return { error: 'barcode must be the 8, 12, 13 or 14 digits under the stripes, and its last digit must check out' };
  }

  if ('allergens' in body) {
    const allergens = body.allergens;
    if (allergens === null) details.allergens = null;
    else if (Array.isArray(allergens) && allergens.every((entry) => typeof entry === 'string' && (ALLERGENS as readonly string[]).includes(entry))) {
      details.allergens = ALLERGENS.filter((key) => (allergens as string[]).includes(key));
    } else return { error: `allergens must be a list drawn from: ${ALLERGENS.join(', ')}` };
  }

  if ('netContent' in body) {
    const net = body.netContent as { amount?: unknown; unit?: unknown } | null;
    if (net === null) details.netContent = null;
    else if (
      net &&
      typeof net === 'object' &&
      typeof net.amount === 'number' &&
      Number.isFinite(net.amount) &&
      net.amount > 0 &&
      net.amount <= 100_000 &&
      typeof net.unit === 'string' &&
      (NET_CONTENT_UNITS as readonly string[]).includes(net.unit)
    ) {
      details.netContent = { amount: Math.round(net.amount * 10) / 10, unit: net.unit as NetContentUnit };
    } else return { error: 'netContent must be { amount: more than 0, unit: "g" or "ml" }' };
  }

  return { details };
}

/** "Contains milk, soy." / "No declared allergens." / null when not recorded. */
export function allergenLine(allergens: readonly Allergen[] | null | undefined): string | null {
  if (allergens === undefined || allergens === null) return null;
  if (allergens.length === 0) return 'No declared allergens.';
  return `Contains ${allergens.map((key) => ALLERGEN_LABEL[key].toLowerCase()).join(', ')}.`;
}

export function netContentLabel(net: NetContent | null | undefined): string | null {
  return net ? `${net.amount.toLocaleString('en-KE')} ${net.unit}` : null;
}
