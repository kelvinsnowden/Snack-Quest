import type { Timestamp } from 'firebase/firestore';

/**
 * The customer screen's look and layout as data (§ KIOSK EXPERIENCE
 * BUILDER). Four layers, most specific wins: the whole fleet, one owner's
 * machines, one location's machines, one machine. Each layer holds a
 * partial config; the screen shows defaults ← global ← owner ← location ←
 * machine. See `lib/kiosk/experienceConfig.ts` for the merge and the
 * rules every published config must pass.
 */

export const KIOSK_LAYER_SCOPES = ['global', 'owner', 'location', 'machine'] as const;
export type KioskLayerScope = (typeof KIOSK_LAYER_SCOPES)[number];

export const KIOSK_LAYER_SCOPE_LABEL: Record<KioskLayerScope, string> = {
  global: 'Every machine',
  owner: 'One owner’s machines',
  location: 'One location’s machines',
  machine: 'One machine',
};

/** Colours are `#rrggbb` only — nothing that can smuggle CSS (no `url()`, no `var()`, no `;`). */
export const KIOSK_THEME_COLOR_KEYS = [
  'background',
  'surface',
  'foreground',
  'mutedForeground',
  'border',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'highlight',
  'highlightForeground',
  'stage',
  'stageForeground',
] as const;
export type KioskThemeColorKey = (typeof KIOSK_THEME_COLOR_KEYS)[number];

export const KIOSK_THEME_COLOR_LABEL: Record<KioskThemeColorKey, string> = {
  background: 'Page background',
  surface: 'Cards and panels',
  foreground: 'Main text',
  mutedForeground: 'Secondary text',
  border: 'Lines',
  primary: 'Main buttons',
  primaryForeground: 'Text on main buttons',
  secondary: 'Second accent',
  secondaryForeground: 'Text on second accent',
  highlight: 'Highlight (badges, “Tap to start”)',
  highlightForeground: 'Text on highlight',
  stage: 'Banner and idle-screen ground',
  stageForeground: 'Text on the banner and idle screen',
};

export const KIOSK_RADII = ['square', 'standard', 'round'] as const;
export type KioskRadius = (typeof KIOSK_RADII)[number];

/** Allow-listed typefaces only: each is already bundled with the site, so a kiosk never fetches a font from anywhere else. */
export const KIOSK_FONTS = ['brand', 'geist', 'system'] as const;
export type KioskFont = (typeof KIOSK_FONTS)[number];
export const KIOSK_FONT_LABEL: Record<KioskFont, string> = {
  brand: 'Snack Quest (Bagel Fat One headings)',
  geist: 'Geist throughout',
  system: 'The device’s own font',
};

export const KIOSK_MOTION = ['standard', 'reduced'] as const;
export type KioskMotion = (typeof KIOSK_MOTION)[number];

export interface KioskTheme {
  colors: Record<KioskThemeColorKey, string>;
  radius: KioskRadius;
  font: KioskFont;
  motion: KioskMotion;
}

/**
 * The menu screen's building blocks, in the order staff choose. A
 * structured list rather than a free canvas: every block reflows for any
 * screen size, and a menu can't be published without the product grid
 * (see `validateKioskConfig`).
 */
export const KIOSK_SECTION_TYPES = ['menu_banner', 'promo_message', 'featured_products', 'category_bar', 'product_grid'] as const;
export type KioskSectionType = (typeof KIOSK_SECTION_TYPES)[number];

export const KIOSK_SECTION_LABEL: Record<KioskSectionType, string> = {
  menu_banner: 'Banner (screen artwork)',
  promo_message: 'Message strip',
  featured_products: 'Featured snacks row',
  category_bar: 'Category buttons',
  product_grid: 'All snacks grid',
};

/** Sections that may appear at most once; the grid must appear exactly once. */
export const KIOSK_SINGLE_SECTIONS: KioskSectionType[] = ['menu_banner', 'category_bar', 'product_grid'];

export interface KioskSection {
  /** Stable within a layout, so reordering is a move, not a delete and add. */
  id: string;
  type: KioskSectionType;
  visible: boolean;
  /** promo_message: `text`, `tone`. featured_products: `title`, `limit`. product_grid: `columns`. */
  props: {
    text?: string;
    tone?: 'primary' | 'secondary' | 'highlight';
    title?: string;
    limit?: number;
    columns?: 'auto' | 2 | 3 | 4;
  };
}

export const KIOSK_BADGE_STATES = ['featured', 'new', 'limited_time'] as const;
export type KioskBadgeState = (typeof KIOSK_BADGE_STATES)[number];
export const KIOSK_BADGE_TONES = ['primary', 'secondary', 'highlight'] as const;
export type KioskBadgeTone = (typeof KIOSK_BADGE_TONES)[number];

export interface KioskBadgeStyle {
  label: string;
  tone: KioskBadgeTone;
  visible: boolean;
}

export interface KioskProductCardOptions {
  showOrigin: boolean;
  showBadges: boolean;
  /** Tapping + adds without opening the product sheet. */
  quickAdd: boolean;
}

export interface KioskIdleOptions {
  /** Seconds without a touch before an abandoned order is cleared and the idle screen shows. */
  timeoutSeconds: number;
  /** Whether the idle screen plays advertising (§ ADVERTISING). Off: it shows the screen artwork only. */
  adsEnabled: boolean;
}

export interface KioskCopy {
  bannerEyebrow: string;
  bannerHeadline: string;
  attractHeadline: string;
  attractCallToAction: string;
}

/** Languages a machine screen can show (§ KIOSK LANGUAGES). Staff write the design's wording in English; other languages translate it. */
export const KIOSK_LOCALES = ['en', 'sw'] as const;
export type KioskLocale = (typeof KIOSK_LOCALES)[number];
/** Each language named in itself, as the switch on the screen shows it. */
export const KIOSK_LOCALE_LABEL: Record<KioskLocale, string> = { en: 'English', sw: 'Kiswahili' };

export interface KioskLanguageOptions {
  /** What customers can switch between. One language: no switch is shown. */
  available: KioskLocale[];
  /** What a new customer sees; the screen returns to it when a session ends. */
  default: KioskLocale;
}

/** The design's own wording in another language. Anything missing shows in English. */
export interface KioskTranslation {
  copy?: Partial<KioskCopy>;
  badges?: Partial<Record<KioskBadgeState, string>>;
  /** By section id: a message strip's `text`, a featured row's `title`. */
  sections?: Record<string, { text?: string; title?: string }>;
}

export interface KioskExperienceConfig {
  theme: KioskTheme;
  browseSections: KioskSection[];
  badges: Record<KioskBadgeState, KioskBadgeStyle>;
  productCard: KioskProductCardOptions;
  idle: KioskIdleOptions;
  copy: KioskCopy;
  language: KioskLanguageOptions;
  translations: Partial<Record<KioskLocale, KioskTranslation>>;
}

/** What one layer sets. Absent keys inherit; `browseSections`, when present, replaces the inherited list whole. */
export interface KioskExperiencePatch {
  theme?: { colors?: Partial<Record<KioskThemeColorKey, string>>; radius?: KioskRadius; font?: KioskFont; motion?: KioskMotion };
  browseSections?: KioskSection[];
  badges?: Partial<Record<KioskBadgeState, Partial<KioskBadgeStyle>>>;
  productCard?: Partial<KioskProductCardOptions>;
  idle?: Partial<KioskIdleOptions>;
  copy?: Partial<KioskCopy>;
  language?: Partial<KioskLanguageOptions>;
  /** Merged per language and field over the inherited translations. */
  translations?: Partial<Record<KioskLocale, KioskTranslation>>;
}

/** `kioskLayers/{businessId}_{scope}_{scopeId}`. The draft is editable; what machines show comes only from published versions. */
export interface KioskLayer {
  businessId: string;
  scope: KioskLayerScope;
  /** `all` for the global layer; otherwise the partner, location or machine id. */
  scopeId: string;
  draft: KioskExperiencePatch;
  draftUpdatedAt: Timestamp | null;
  draftUpdatedBy: string | null;
  publishedVersionId: string | null;
  publishedVersionNumber: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `kioskLayerVersions` — immutable once written. A rollback publishes a new version carrying an old version's config. */
export interface KioskLayerVersion {
  businessId: string;
  layerId: string;
  scope: KioskLayerScope;
  scopeId: string;
  versionNumber: number;
  config: KioskExperiencePatch;
  note: string;
  rolledBackFrom: number | null;
  publishedBy: string;
  publishedAt: Timestamp;
}

/**
 * `kioskPublishedIndex/{businessId}` — which layers have a published
 * version, kept in the publish transaction. A machine's screen resolves
 * from this one (cached) document plus immutable versions, so 10,000
 * machines polling don't each read four layer documents.
 */
export interface KioskPublishedIndex {
  businessId: string;
  layers: Record<string, { versionId: string; versionNumber: number }>;
  updatedAt: Timestamp;
}

/** The size and shape of a machine's screen (§ DEVICE PROFILES). Used for preview and layout density. */
export interface MachineDisplayProfile {
  widthPx: number;
  heightPx: number;
  diagonalInches: number | null;
  orientation: 'portrait' | 'landscape';
}

export interface ResolvedKioskExperience {
  config: KioskExperienceConfig;
  /** Changes whenever any contributing published version changes; the screen uses it to know a new look is available. */
  version: string;
  sources: { scope: KioskLayerScope; scopeId: string; versionNumber: number; draft: boolean }[];
}
