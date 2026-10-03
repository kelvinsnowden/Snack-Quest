import {
  KIOSK_BADGE_STATES,
  KIOSK_BADGE_TONES,
  KIOSK_FONTS,
  KIOSK_MOTION,
  KIOSK_RADII,
  KIOSK_SECTION_TYPES,
  KIOSK_SINGLE_SECTIONS,
  KIOSK_THEME_COLOR_KEYS,
  KIOSK_THEME_COLOR_LABEL,
  type KioskExperienceConfig,
  type KioskExperiencePatch,
  type KioskSection,
  type KioskThemeColorKey,
} from '@/types/kioskExperience';

/**
 * The kiosk experience rules, shared by the server (publish, resolve) and
 * the builder in the browser (live checks while editing). Pure: no I/O.
 */

/** Today's screen, exactly — a fleet with no layers published looks the way it always has. */
export const DEFAULT_KIOSK_EXPERIENCE: KioskExperienceConfig = {
  theme: {
    colors: {
      background: '#f4f2fb',
      surface: '#ffffff',
      foreground: '#1f1f1f',
      mutedForeground: '#756e5f',
      border: '#e7dfd0',
      primary: '#ff7a00',
      primaryForeground: '#ffffff',
      secondary: '#6c3bff',
      secondaryForeground: '#ffffff',
      highlight: '#c8ff00',
      highlightForeground: '#1f1f1f',
      stage: '#170132',
      stageForeground: '#fff8ee',
    },
    radius: 'standard',
    font: 'brand',
    motion: 'standard',
  },
  browseSections: [
    { id: 'banner', type: 'menu_banner', visible: true, props: {} },
    { id: 'categories', type: 'category_bar', visible: true, props: {} },
    { id: 'grid', type: 'product_grid', visible: true, props: { columns: 'auto' } },
  ],
  badges: {
    featured: { label: 'Featured', tone: 'secondary', visible: true },
    new: { label: 'New', tone: 'highlight', visible: true },
    limited_time: { label: 'Limited time', tone: 'primary', visible: true },
  },
  productCard: { showOrigin: true, showBadges: true, quickAdd: true },
  idle: { timeoutSeconds: 60, adsEnabled: true },
  copy: {
    bannerEyebrow: 'Explore. Taste. Enjoy.',
    bannerHeadline: 'Taste the world',
    attractHeadline: 'Snacks from around the world, right here.',
    attractCallToAction: 'Tap to start',
  },
};

export const KIOSK_LIMITS = {
  idleSecondsMin: 20,
  idleSecondsMax: 600,
  promoTextMax: 120,
  sectionTitleMax: 40,
  badgeLabelMax: 18,
  copyMax: { bannerEyebrow: 40, bannerHeadline: 40, attractHeadline: 90, attractCallToAction: 24 },
  featuredLimitMax: 8,
  sectionsMax: 8,
  /** WCAG 2.1 AA: body text 4.5:1; large text and button labels 3:1. */
  textContrastMin: 4.5,
  largeTextContrastMin: 3,
} as const;

const HEX = /^#[0-9a-f]{6}$/;
const SECTION_ID = /^[a-z0-9_-]{1,24}$/;

export class KioskConfigValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(' '));
    this.name = 'KioskConfigValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, label: string, problems: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    problems.push(`${label} must be text.`);
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    problems.push(`${label} can’t be empty.`);
    return undefined;
  }
  if (trimmed.length > max) {
    problems.push(`Keep ${label.toLowerCase()} under ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, problems: string[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  problems.push(`${label} must be one of: ${allowed.join(', ')}.`);
  return undefined;
}

function bool(value: unknown, label: string, problems: string[]): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  problems.push(`${label} must be on or off.`);
  return undefined;
}

function parseSection(value: unknown, index: number, problems: string[]): KioskSection | null {
  const where = `Section ${index + 1}`;
  if (!isRecord(value)) {
    problems.push(`${where} is not a section.`);
    return null;
  }
  const type = oneOf(value.type, KIOSK_SECTION_TYPES, `${where}’s type`, problems);
  const id = typeof value.id === 'string' && SECTION_ID.test(value.id) ? value.id : null;
  if (!id) problems.push(`${where} needs a short id (letters, digits, - or _).`);
  if (!type || !id) return null;
  const props = isRecord(value.props) ? value.props : {};
  const section: KioskSection = { id, type, visible: value.visible !== false, props: {} };
  if (type === 'promo_message') {
    section.props.text = text(props.text, KIOSK_LIMITS.promoTextMax, `${where}’s message`, problems) ?? '';
    section.props.tone = oneOf(props.tone ?? 'highlight', KIOSK_BADGE_TONES, `${where}’s colour`, problems) ?? 'highlight';
    if (!section.props.text) problems.push(`${where} (message strip) needs a message.`);
  } else if (type === 'featured_products') {
    section.props.title = text(props.title ?? 'Featured', KIOSK_LIMITS.sectionTitleMax, `${where}’s title`, problems) ?? 'Featured';
    const limit = props.limit ?? 4;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > KIOSK_LIMITS.featuredLimitMax) {
      problems.push(`${where} can show between 1 and ${KIOSK_LIMITS.featuredLimitMax} snacks.`);
    } else {
      section.props.limit = limit;
    }
  } else if (type === 'product_grid') {
    const columns = props.columns ?? 'auto';
    if (columns === 'auto' || columns === 2 || columns === 3 || columns === 4) {
      section.props.columns = columns;
    } else {
      problems.push(`${where}’s columns must be auto, 2, 3 or 4.`);
    }
  }
  return section;
}

/**
 * Checks and normalises one layer's settings as sent by the builder.
 * Unknown keys are dropped; anything malformed is a problem, never
 * silently fixed. Throws `KioskConfigValidationError` listing every problem.
 */
export function parseKioskPatch(input: unknown): KioskExperiencePatch {
  const problems: string[] = [];
  if (!isRecord(input)) throw new KioskConfigValidationError(['Send the screen settings as an object.']);
  const patch: KioskExperiencePatch = {};

  if (input.theme !== undefined) {
    if (!isRecord(input.theme)) {
      problems.push('Theme must be an object.');
    } else {
      const theme: NonNullable<KioskExperiencePatch['theme']> = {};
      if (input.theme.colors !== undefined) {
        if (!isRecord(input.theme.colors)) {
          problems.push('Theme colours must be an object.');
        } else {
          const colors: Partial<Record<KioskThemeColorKey, string>> = {};
          for (const key of KIOSK_THEME_COLOR_KEYS) {
            const value = input.theme.colors[key];
            if (value === undefined) continue;
            const normalised = typeof value === 'string' ? value.trim().toLowerCase() : '';
            if (!HEX.test(normalised)) {
              problems.push(`${KIOSK_THEME_COLOR_LABEL[key]} must be a colour like #1f1f1f.`);
            } else {
              colors[key] = normalised;
            }
          }
          if (Object.keys(colors).length > 0) theme.colors = colors;
        }
      }
      const radius = oneOf(input.theme.radius, KIOSK_RADII, 'Corner style', problems);
      const font = oneOf(input.theme.font, KIOSK_FONTS, 'Font', problems);
      const motion = oneOf(input.theme.motion, KIOSK_MOTION, 'Motion', problems);
      if (radius) theme.radius = radius;
      if (font) theme.font = font;
      if (motion) theme.motion = motion;
      if (Object.keys(theme).length > 0) patch.theme = theme;
    }
  }

  if (input.browseSections !== undefined) {
    if (!Array.isArray(input.browseSections)) {
      problems.push('The menu layout must be a list of sections.');
    } else if (input.browseSections.length > KIOSK_LIMITS.sectionsMax) {
      problems.push(`The menu can have at most ${KIOSK_LIMITS.sectionsMax} sections.`);
    } else {
      const sections = input.browseSections.map((section, index) => parseSection(section, index, problems)).filter((section): section is KioskSection => section !== null);
      const ids = new Set<string>();
      for (const section of sections) {
        if (ids.has(section.id)) problems.push(`Two sections share the id “${section.id}”.`);
        ids.add(section.id);
      }
      patch.browseSections = sections;
    }
  }

  if (input.badges !== undefined) {
    if (!isRecord(input.badges)) {
      problems.push('Badges must be an object.');
    } else {
      const badges: NonNullable<KioskExperiencePatch['badges']> = {};
      for (const state of KIOSK_BADGE_STATES) {
        const value = input.badges[state];
        if (value === undefined) continue;
        if (!isRecord(value)) {
          problems.push(`The ${state} badge must be an object.`);
          continue;
        }
        const label = text(value.label, KIOSK_LIMITS.badgeLabelMax, `The ${state.replace('_', ' ')} badge’s label`, problems);
        const tone = oneOf(value.tone, KIOSK_BADGE_TONES, `The ${state} badge’s colour`, problems);
        const visible = bool(value.visible, `Showing the ${state} badge`, problems);
        badges[state] = { ...(label ? { label } : {}), ...(tone ? { tone } : {}), ...(visible !== undefined ? { visible } : {}) };
      }
      patch.badges = badges;
    }
  }

  if (input.productCard !== undefined) {
    if (!isRecord(input.productCard)) {
      problems.push('Product card options must be an object.');
    } else {
      const showOrigin = bool(input.productCard.showOrigin, 'Showing where a snack is from', problems);
      const showBadges = bool(input.productCard.showBadges, 'Showing badges', problems);
      const quickAdd = bool(input.productCard.quickAdd, 'Quick add', problems);
      patch.productCard = { ...(showOrigin !== undefined ? { showOrigin } : {}), ...(showBadges !== undefined ? { showBadges } : {}), ...(quickAdd !== undefined ? { quickAdd } : {}) };
    }
  }

  if (input.idle !== undefined) {
    if (!isRecord(input.idle)) {
      problems.push('Idle options must be an object.');
    } else {
      const idle: NonNullable<KioskExperiencePatch['idle']> = {};
      if (input.idle.timeoutSeconds !== undefined) {
        const seconds = input.idle.timeoutSeconds;
        if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < KIOSK_LIMITS.idleSecondsMin || seconds > KIOSK_LIMITS.idleSecondsMax) {
          problems.push(`The idle timeout must be a whole number of seconds from ${KIOSK_LIMITS.idleSecondsMin} to ${KIOSK_LIMITS.idleSecondsMax}.`);
        } else {
          idle.timeoutSeconds = seconds;
        }
      }
      const adsEnabled = bool(input.idle.adsEnabled, 'Advertising on the idle screen', problems);
      if (adsEnabled !== undefined) idle.adsEnabled = adsEnabled;
      patch.idle = idle;
    }
  }

  if (input.copy !== undefined) {
    if (!isRecord(input.copy)) {
      problems.push('Screen wording must be an object.');
    } else {
      const copy: NonNullable<KioskExperiencePatch['copy']> = {};
      const labels = { bannerEyebrow: 'The banner’s small line', bannerHeadline: 'The banner headline', attractHeadline: 'The idle-screen headline', attractCallToAction: 'The “tap to start” button' } as const;
      for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
        const value = text(input.copy[key], KIOSK_LIMITS.copyMax[key], labels[key], problems);
        if (value) copy[key] = value;
      }
      patch.copy = copy;
    }
  }

  if (problems.length > 0) throw new KioskConfigValidationError(problems);
  return patch;
}

/** Layers applied in order over the defaults. Objects merge key by key; the section list is replaced whole by the most specific layer that sets one. */
export function mergeKioskExperience(base: KioskExperienceConfig, ...patches: KioskExperiencePatch[]): KioskExperienceConfig {
  let config: KioskExperienceConfig = structuredClone(base);
  for (const patch of patches) {
    config = {
      theme: {
        colors: { ...config.theme.colors, ...(patch.theme?.colors ?? {}) },
        radius: patch.theme?.radius ?? config.theme.radius,
        font: patch.theme?.font ?? config.theme.font,
        motion: patch.theme?.motion ?? config.theme.motion,
      },
      browseSections: patch.browseSections ? structuredClone(patch.browseSections) : config.browseSections,
      badges: {
        featured: { ...config.badges.featured, ...(patch.badges?.featured ?? {}) },
        new: { ...config.badges.new, ...(patch.badges?.new ?? {}) },
        limited_time: { ...config.badges.limited_time, ...(patch.badges?.limited_time ?? {}) },
      },
      productCard: { ...config.productCard, ...(patch.productCard ?? {}) },
      idle: { ...config.idle, ...(patch.idle ?? {}) },
      copy: { ...config.copy, ...(patch.copy ?? {}) },
    };
  }
  return config;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export interface KioskConfigCheck {
  /** Stop publishing: the screen would be unusable or unreadable. */
  errors: string[];
  /** Publishable, but staff should know. */
  warnings: string[];
}

const TEXT_PAIRS: [KioskThemeColorKey, KioskThemeColorKey][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['stageForeground', 'stage'],
];
const LABEL_PAIRS: [KioskThemeColorKey, KioskThemeColorKey][] = [
  ['mutedForeground', 'surface'],
  ['primaryForeground', 'primary'],
  ['secondaryForeground', 'secondary'],
  ['highlightForeground', 'highlight'],
];

/**
 * Whether a complete, merged config is fit for a customer screen. Body
 * text below 4.5:1 blocks publishing — a customer must be able to read
 * prices. Button and badge labels below 3:1 are a warning: the current
 * brand orange with white text is 2.6:1, and changing brand colours is a
 * brand decision, not the builder's.
 */
export function checkKioskExperience(config: KioskExperienceConfig): KioskConfigCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const visible = config.browseSections.filter((section) => section.visible);
  const grids = config.browseSections.filter((section) => section.type === 'product_grid');
  if (grids.length !== 1 || !grids[0].visible) {
    errors.push('The menu needs the “All snacks” grid, shown, exactly once — without it customers can’t buy anything.');
  }
  for (const type of KIOSK_SINGLE_SECTIONS) {
    if (type !== 'product_grid' && config.browseSections.filter((section) => section.type === type).length > 1) {
      errors.push(`“${type.replace('_', ' ')}” can appear only once.`);
    }
  }
  if (visible.length === 0) errors.push('The menu has no visible sections.');
  for (const [text, ground] of TEXT_PAIRS) {
    const ratio = contrastRatio(config.theme.colors[text], config.theme.colors[ground]);
    if (ratio < KIOSK_LIMITS.textContrastMin) {
      errors.push(`${KIOSK_THEME_COLOR_LABEL[text]} on ${KIOSK_THEME_COLOR_LABEL[ground].toLowerCase()} is ${ratio.toFixed(1)}:1; it needs at least ${KIOSK_LIMITS.textContrastMin}:1 to be readable.`);
    }
  }
  for (const [text, ground] of LABEL_PAIRS) {
    const ratio = contrastRatio(config.theme.colors[text], config.theme.colors[ground]);
    if (ratio < KIOSK_LIMITS.largeTextContrastMin) {
      warnings.push(`${KIOSK_THEME_COLOR_LABEL[text]} on ${KIOSK_THEME_COLOR_LABEL[ground].toLowerCase()} is ${ratio.toFixed(1)}:1, below the ${KIOSK_LIMITS.largeTextContrastMin}:1 recommended for large labels.`);
    }
  }
  if (!config.idle.adsEnabled) warnings.push('Advertising is off on the idle screen for these machines; booked campaigns won’t play here.');
  return { errors, warnings };
}

/** FNV-1a, so the browser and server compute the same short version id without crypto. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** CSS custom properties that re-theme the kiosk subtree (the site's tokens are `@theme inline`, so overriding `--sq-*` here re-colours every utility beneath). */
export function kioskThemeStyle(config: KioskExperienceConfig): Record<string, string> {
  const { colors, radius, font } = config.theme;
  const radii = { square: ['2px', '4px', '6px', '8px'], standard: ['8px', '12px', '16px', '24px'], round: ['12px', '18px', '24px', '32px'] }[radius];
  const style: Record<string, string> = {
    '--sq-background': colors.background,
    '--sq-surface': colors.surface,
    '--sq-surface-raised': colors.surface,
    '--sq-foreground': colors.foreground,
    '--sq-muted': colors.mutedForeground,
    '--sq-muted-foreground': colors.mutedForeground,
    '--sq-border': colors.border,
    '--sq-primary': colors.primary,
    '--sq-primary-foreground': colors.primaryForeground,
    '--sq-secondary': colors.secondary,
    '--sq-secondary-foreground': colors.secondaryForeground,
    '--sq-kiosk-highlight': colors.highlight,
    '--sq-kiosk-highlight-foreground': colors.highlightForeground,
    '--sq-kiosk-stage': colors.stage,
    '--sq-kiosk-stage-foreground': colors.stageForeground,
    '--sq-radius-sm': radii[0],
    '--sq-radius-md': radii[1],
    '--sq-radius-lg': radii[2],
    '--sq-radius-xl': radii[3],
  };
  if (font === 'geist') style['--sq-font-display'] = 'var(--font-geist-sans)';
  if (font === 'system') style['--sq-font-display'] = 'system-ui';
  return style;
}
