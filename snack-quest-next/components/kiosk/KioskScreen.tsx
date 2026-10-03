'use client';

import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CircleSlash, Loader2, MapPin, Minus, Plus, RotateCcw, Search, Smartphone, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { KioskExperienceConfig, KioskScreenContent, KioskScreenContentImage, KioskSection, SellableCatalogItem } from '@/types';
import { DEFAULT_KIOSK_EXPERIENCE, checkKioskExperience, kioskThemeStyle, mergeKioskExperience, parseKioskPatch } from '@/lib/kiosk/experienceConfig';
import { ProductCard, ProductImage, STATE_LABEL, type ProductCardOptions } from './ProductCard';
import { AttractScreen, MenuBanner } from './ScreenArtwork';
import { AdPlayer, type AdEvent } from './AdPlayer';
import { ServiceCodePrompt, ServiceScreen } from './ServiceMode';
import { PersistedBatchQueue, clearMediaCache, loadVerifiedMedia } from '@/lib/kiosk/deviceQueue';
import { parsePlaylist } from '@/lib/kiosk/contentPackage';
import { kioskTransition } from '@/lib/kiosk/runtimeMachine';
import type { MachinePlaylist } from '@/lib/ads/playlist';
import type { KioskMetric } from '@/types/kioskRuntime';
import { PhoneKeypad } from './PhoneKeypad';
import { readPairingFragment } from '@/lib/vending/kioskPairing';
import { MONEY_IN_FLIGHT, RESULT_STATES, idleTimerRuns, kioskReducer, outcomeOf, type KioskState } from '@/lib/kiosk/runtimeMachine';
import { cartKey, formatKes, formatPhoneNumber, isCompletePhoneNumber, PHONE_MAX_DIGITS } from './format';

/**
 * The customer-facing touchscreen experience for one physical machine
 * (§ PART 1 — CUSTOMER MACHINE EXPERIENCE). Client Component because a
 * kiosk is one long-lived, stateful page — pairing, browsing, a cart,
 * polling — not something that navigates between URLs.
 *
 * § SHOPPING FLOW: menu (banner, categories, products, the order
 * always visible along the bottom) → product sheet → pay with M-Pesa
 * (number pad) → waiting for M-Pesa → result → back to the menu. The
 * order shows one combined total and the customer pays it with exactly
 * **one** M-Pesa prompt, however many items are in it —
 * `POST /api/vending/payments` is called once, with every order line
 * flattened into one `slotId` per physical unit (`slotIds`), and
 * `machineTransactionService.initiateCartPayment` creates one
 * `MachineTransaction` per unit (the sale is still recorded per slot,
 * for inventory/settlement/COGS) while asking Daraja for a single STK
 * push covering the total. The machine still dispenses one slot at a
 * time — a fact about the hardware, not the payment — so once that one
 * payment clears, each unit's own vend is authorized in turn and this
 * screen polls every transaction it got back until each has its own
 * final outcome.
 *
 * § SCREEN ARTWORK: the menu banner and the idle screen show images
 * staff choose in Admin (`GET .../screen`, `kioskScreenService`); with
 * none chosen they draw the built-in brand design. Product photos,
 * names and descriptions come with the catalog.
 *
 * § KIOSK EXPERIENCE: colours, corners, font, the order of the menu's
 * sections, badge wording, product-card options, the idle timeout and the
 * screen's wording all come from the published design layers
 * (`GET .../content`, `kioskExperienceService`). Anything the screen can't
 * validate falls back to the built-in design; it never renders an
 * unchecked value.
 *
 * § PREVIEW: with `preview`, the same renderer draws a given design and
 * menu for the builder — no pairing, no network, and payments are off.
 *
 * § IDLE: a customer who walks away mid-order must not leave their
 * order for the next person. After the idle timeout without a touch —
 * never while a payment is in flight or a result is showing — the
 * order is cleared and the idle screen takes over until someone taps.
 *
 * § KIOSK PAIRING: a kiosk is not a customer with an account and not
 * a staff member with a session — it *is* the machine, using the same
 * `Authorization: Bearer <machineId>:<secret>` scheme every other
 * device route already requires (`lib/vending/deviceAuth.ts`), issued
 * once at physical installation and stored only in this browser's own
 * `localStorage` — no new auth mechanism, no session cookie.
 */

const PAIRING_KEY_PREFIX = 'sq_kiosk_secret_';
const CATALOG_POLL_MS = 20_000;
const PAYMENT_POLL_MS = 3_000;
const PAYMENT_POLL_TIMEOUT_MS = 90_000;
/** Long enough to read and walk to the tray; a problem needs longer, because it tells the customer what happens to their money. */
const RESULT_DISPLAY_SUCCESS_MS = 6_000;
const RESULT_DISPLAY_ISSUE_MS = 15_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
/** How often queued ad plays and activity counts are sent (§ PLAYBACK EVENTS, § KIOSK OBSERVABILITY). */
const AD_FLUSH_MS = 60_000;
const REPORT_FLUSH_MS = 5 * 60_000;
/** Holding the logo this long opens the service-code prompt. */
const SERVICE_HOLD_MS = 3_000;
const EMPTY_PLAYLIST: MachinePlaylist = { version: 'none', campaigns: [] };

type QueuedAdEvent = { clientEventId: string; campaignId: string; creativeId: string; eventType: AdEvent['eventType']; occurredAt: string; playedMs?: number; failureReason?: string };

function eventId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

type TransactionStatus =
  | 'pending'
  | 'payment_failed'
  | 'paid'
  | 'vend_authorized'
  | 'dispensed'
  | 'paid_vend_failed'
  | 'refund_requested'
  | 'refunded'
  | 'manual_review';

const TERMINAL_STATUSES: TransactionStatus[] = ['dispensed', 'paid_vend_failed', 'payment_failed', 'manual_review', 'refunded'];
const SUCCESS_STATUSES: TransactionStatus[] = ['dispensed'];

interface CatalogResponse {
  catalogVersion: string;
  items: SellableCatalogItem[];
}

type CartLine = { item: SellableCatalogItem; quantity: number };
type View = 'browse' | 'checkout' | 'paying' | 'result';
/** One physical unit's own vend, once the order's one payment has been accepted and this unit's transaction id is known. */
type CartTransaction = { id: string; item: SellableCatalogItem };

const EMPTY_SCREEN: KioskScreenContent = { menu_banner: [], attract: [] };

/** Static class names per grid setting, so Tailwind can see every one of them. */
const GRID_COLUMNS: Record<string, string> = {
  auto: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 sm:grid-cols-3',
  '4': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

const TONE_CLASS = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  highlight: 'bg-kiosk-highlight text-kiosk-highlight-foreground',
} as const;

function authHeader(machineId: string, secret: string): string {
  return `Bearer ${machineId}:${secret}`;
}

function cachedCatalogKey(machineId: string): string {
  return `sq_kiosk_catalog_cache_${machineId}`;
}

function cachedScreenKey(machineId: string): string {
  return `sq_kiosk_screen_cache_${machineId}`;
}

function cachedExperienceKey(machineId: string): string {
  return `sq_kiosk_experience_cache_${machineId}`;
}

function cachedPlaylistKey(machineId: string): string {
  return `sq_kiosk_playlist_cache_${machineId}`;
}

/** A design from the server or the cache, re-checked here: anything malformed or unreadable means the built-in design. */
export function parseExperience(value: unknown): KioskExperienceConfig {
  try {
    const config = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, parseKioskPatch(value));
    return checkKioskExperience(config).errors.length === 0 ? config : DEFAULT_KIOSK_EXPERIENCE;
  } catch {
    return DEFAULT_KIOSK_EXPERIENCE;
  }
}

export interface KioskPreview {
  experience: KioskExperienceConfig;
  catalog: { catalogVersion: string; items: SellableCatalogItem[] };
  screen: KioskScreenContent;
  startIdle?: boolean;
}

/** Keeps only well-formed images from a screen response or cache — a bad entry is dropped, never rendered. */
function parseScreen(value: unknown): KioskScreenContent {
  const source = (value ?? {}) as Record<string, unknown>;
  const pick = (list: unknown): KioskScreenContentImage[] =>
    Array.isArray(list)
      ? list.filter(
          (image): image is KioskScreenContentImage =>
            typeof image === 'object' &&
            image !== null &&
            typeof (image as KioskScreenContentImage).imageUrl === 'string' &&
            typeof (image as KioskScreenContentImage).altText === 'string' &&
            /^(https:\/\/|\/(?!\/))/.test((image as KioskScreenContentImage).imageUrl),
        )
      : [];
  return { menu_banner: pick(source.menu_banner), attract: pick(source.attract) };
}

export function KioskScreen({ machineId, machineCode, idleTimeoutMs: idleTimeoutOverrideMs, preview }: { machineId: string; machineCode: string; idleTimeoutMs?: number; preview?: KioskPreview }) {
  const [experience, setExperience] = useState<KioskExperienceConfig>(preview?.experience ?? DEFAULT_KIOSK_EXPERIENCE);
  const idleTimeoutMs = idleTimeoutOverrideMs ?? (experience.idle.timeoutSeconds * 1000 || DEFAULT_IDLE_TIMEOUT_MS);
  const [secret, setSecret] = useState<string | null>(preview ? 'preview' : null);
  const [pairingInput, setPairingInput] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogResponse | null>(preview?.catalog ?? null);
  const [screen, setScreen] = useState<KioskScreenContent>(preview?.screen ?? EMPTY_SCREEN);
  const [ads, setAds] = useState<MachinePlaylist>(EMPTY_PLAYLIST);
  const [adMedia, setAdMedia] = useState<Record<string, string>>({});
  const [lastContentAt, setLastContentAt] = useState<string | null>(null);
  const [servicePrompt, setServicePrompt] = useState(false);
  const [serviceExpiresAt, setServiceExpiresAt] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // § KIOSK RUNTIME STATE MACHINE: every screen change is an event; the reducer refuses any the current state doesn't allow.
  const [runtime, dispatch] = useReducer(kioskReducer, (preview ? (preview.startIdle ? 'IDLE' : 'SHOPPING') : 'BOOTING') as KioskState);
  const attract = runtime === 'IDLE';
  const view: View = runtime === 'CHECKOUT' ? 'checkout' : MONEY_IN_FLIGHT.includes(runtime) ? 'paying' : RESULT_STATES.includes(runtime) ? 'result' : 'browse';
  const [category, setCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailItem, setDetailItem] = useState<SellableCatalogItem | null>(null);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());

  const [phoneDigits, setPhoneDigits] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cartTransactions, setCartTransactions] = useState<CartTransaction[]>([]);
  const [statuses, setStatuses] = useState<Record<string, TransactionStatus>>({});
  const [failureReasons, setFailureReasons] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);

  const authRef = useRef<string | null>(null);
  const packageVersionRef = useRef<string | null>(null);
  const catalogVersionRef = useRef<string | null>(null);
  const mediaRef = useRef<Map<string, { sha256: string; url: string }>>(new Map());
  const adQueueRef = useRef<PersistedBatchQueue<QueuedAdEvent> | null>(null);
  const metricQueueRef = useRef<PersistedBatchQueue<KioskMetric> | null>(null);
  const cartCountRef = useRef(0);

  /** Counts what customers do (§ KIOSK ANALYTICS). Counts only; never in preview. */
  const count = useCallback(
    (metric: KioskMetric) => {
      if (!preview) metricQueueRef.current?.add(metric);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
    [],
  );

  /** Verifies every creative's file against its checksum (from the device cache or the network); only verified files can play. */
  const stageMedia = useCallback(
    async (playlist: MachinePlaylist): Promise<Record<string, string>> => {
      const ready: Record<string, string> = {};
      for (const campaign of playlist.campaigns) {
        for (const creative of campaign.creatives) {
          const known = mediaRef.current.get(creative.creativeId);
          if (known && known.sha256 === creative.sha256) {
            ready[creative.creativeId] = known.url;
            continue;
          }
          const loaded = await loadVerifiedMedia(creative).catch(() => ({ url: null, fromCache: false, rejected: false }));
          if (loaded.rejected) count('ad_media_rejected');
          if (loaded.url) {
            mediaRef.current.set(creative.creativeId, { sha256: creative.sha256, url: loaded.url });
            ready[creative.creativeId] = loaded.url;
          }
        }
      }
      return ready;
    },
    [count],
  );
  const lastTouchRef = useRef(0);

  useEffect(() => {
    if (preview) return;
    // QR pairing: the admin's pairing code opens this page with the key after `#pair=`.
    // The fragment never reaches a server; save the key, then wipe it from the address bar and history.
    const paired = readPairingFragment(window.location.hash);
    if (paired) {
      window.localStorage.setItem(`${PAIRING_KEY_PREFIX}${machineId}`, paired);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const stored = paired ?? window.localStorage.getItem(`${PAIRING_KEY_PREFIX}${machineId}`);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the paired secret from localStorage is the intentional sync-from-browser-storage-after-mount step, not an update loop; `window` doesn't exist during SSR so this can't be a lazy useState initializer either.
      setSecret(stored);
    }
    const cachedScreen = window.localStorage.getItem(cachedScreenKey(machineId));
    if (cachedScreen) {
      try {
        setScreen(parseScreen(JSON.parse(cachedScreen)));
      } catch {
        // corrupt cache — the built-in design shows until the next fetch
      }
    }
    const cachedExperience = window.localStorage.getItem(cachedExperienceKey(machineId));
    if (cachedExperience) {
      try {
        setExperience(parseExperience(JSON.parse(cachedExperience)));
      } catch {
        // corrupt cache — the built-in design shows until the next fetch
      }
    }
    adQueueRef.current = new PersistedBatchQueue<QueuedAdEvent>(window.localStorage, `sq_kiosk_ad_events_${machineId}`, { batchSize: 500, maxPending: 5_000 });
    metricQueueRef.current = new PersistedBatchQueue<KioskMetric>(window.localStorage, `sq_kiosk_metrics_${machineId}`, { batchSize: 5_000, maxPending: 20_000 });
    const cachedPlaylist = window.localStorage.getItem(cachedPlaylistKey(machineId));
    if (cachedPlaylist) {
      try {
        const playlist = parsePlaylist(JSON.parse(cachedPlaylist));
        // Offline start: the cached playlist plays from verified cached files only.
        void stageMedia(playlist).then((ready) => {
          setAds(playlist);
          setAdMedia(ready);
        });
      } catch {
        // corrupt cache — no ads until the next sync
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [machineId]);

  useEffect(() => {
    authRef.current = secret ? authHeader(machineId, secret) : null;
  }, [machineId, secret]);

  const fetchCatalog = useCallback(async () => {
    const auth = authRef.current;
    if (!auth || preview) return;
    try {
      const res = await fetch(`/api/vending/machines/${machineId}/catalog`, { headers: { Authorization: auth }, cache: 'no-store' });
      if (res.status === 401) {
        // Paired secret was revoked — never keep offering a screen a revoked credential can't actually serve.
        window.localStorage.removeItem(`${PAIRING_KEY_PREFIX}${machineId}`);
        setSecret(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`catalog fetch failed (${res.status})`);
      }
      const body = (await res.json()) as CatalogResponse;
      setCatalog(body);
      catalogVersionRef.current = body.catalogVersion ?? null;
      dispatch({ type: 'MENU_READY' });
      setOffline(false);
      setCatalogError(null);
      window.localStorage.setItem(cachedCatalogKey(machineId), JSON.stringify(body));
    } catch {
      // § OFFLINE BEHAVIOUR: fall back to the cached catalog rather than blanking the screen — purchase still requires connectivity (never queued client-side, which would risk double-charging).
      const cached = window.localStorage.getItem(cachedCatalogKey(machineId));
      let fromCache = false;
      if (cached) {
        try {
          setCatalog(JSON.parse(cached) as CatalogResponse);
          fromCache = true;
        } catch {
          // corrupt cache — fall through to the error state below
        }
      }
      dispatch({ type: fromCache ? 'MENU_READY' : 'MENU_UNAVAILABLE' });
      setOffline(true);
      setCatalogError('Could not reach Snack Quest — showing the last known menu.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [machineId]);

  /** The screen's design and artwork are decoration: any failure keeps whatever is already showing (cached or built-in). */
  const fetchContent = useCallback(async () => {
    const auth = authRef.current;
    if (!auth || preview) return;
    try {
      const have = packageVersionRef.current;
      const res = await fetch(`/api/vending/machines/${machineId}/content${have ? `?have=${encodeURIComponent(have)}` : ''}`, { headers: { Authorization: auth }, cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { unchanged?: boolean; packageVersion?: unknown; screen?: unknown; experience?: { config?: unknown }; ads?: unknown };
      if (!body || typeof body !== 'object' || body.unchanged) return;
      // § CONTENT SYNC: validate and stage everything first (ad files verified against their checksums), then switch to it all at once.
      const nextScreen = typeof body.screen === 'object' ? parseScreen(body.screen) : null;
      const nextExperience = body.experience && typeof body.experience.config === 'object' ? parseExperience(body.experience.config) : null;
      const nextAds = parsePlaylist(body.ads);
      const nextMedia = await stageMedia(nextAds);
      const nextVersion = typeof body.packageVersion === 'string' ? body.packageVersion : null;
      if (nextScreen) setScreen(nextScreen);
      if (nextExperience) setExperience(nextExperience);
      setAds(nextAds);
      setAdMedia(nextMedia);
      setLastContentAt(new Date().toISOString());
      if (nextVersion !== packageVersionRef.current) count('content_activated');
      packageVersionRef.current = nextVersion;
      if (nextScreen) window.localStorage.setItem(cachedScreenKey(machineId), JSON.stringify(nextScreen));
      if (nextExperience) window.localStorage.setItem(cachedExperienceKey(machineId), JSON.stringify(nextExperience));
      window.localStorage.setItem(cachedPlaylistKey(machineId), JSON.stringify(nextAds));
    } catch {
      // offline or unexpected — keep the current design and artwork
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [machineId, stageMedia, count]);

  /** Sends the oldest unacknowledged batch of ad plays; the same batch id is resent until the server has it. */
  const flushAds = useCallback(async () => {
    const auth = authRef.current;
    const queue = adQueueRef.current;
    if (!auth || !queue || preview) return;
    const batch = queue.nextBatch();
    if (!batch) return;
    try {
      const res = await fetch(`/api/vending/machines/${machineId}/ad-events`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.batchId, packageVersion: packageVersionRef.current, events: batch.items }),
      });
      // 400 means the batch itself can never be accepted; keeping it would block every later report.
      if (res.ok || res.status === 400) queue.acknowledge(batch.batchId);
    } catch {
      // offline — the same batch goes next time
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [machineId]);

  const runtimeRef = useRef(runtime);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  const cachedCreativesRef = useRef(0);
  useEffect(() => {
    cachedCreativesRef.current = Object.keys(adMedia).length;
  }, [adMedia]);

  /** Tells the server what this screen is showing and what customers did since the last report (§ KIOSK OBSERVABILITY). */
  const flushReport = useCallback(async () => {
    const auth = authRef.current;
    const queue = metricQueueRef.current;
    if (!auth || !queue || preview) return;
    const batch = queue.nextBatch() ?? { batchId: eventId(), items: [] as KioskMetric[] };
    const counts: Partial<Record<KioskMetric, number>> = {};
    for (const metric of batch.items) counts[metric] = (counts[metric] ?? 0) + 1;
    try {
      const res = await fetch(`/api/vending/machines/${machineId}/kiosk-report`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.batchId,
          packageVersion: packageVersionRef.current,
          catalogVersion: catalogVersionRef.current,
          runtimeState: runtimeRef.current,
          pendingAdEvents: adQueueRef.current?.size() ?? 0,
          cachedCreatives: cachedCreativesRef.current,
          counts,
        }),
      });
      if (res.ok || res.status === 400) queue.acknowledge(batch.batchId);
    } catch {
      // offline — the same batch goes next time
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [machineId]);

  useEffect(() => {
    if (!secret || preview) return;
    const ads = setInterval(() => void flushAds(), AD_FLUSH_MS);
    const reports = setInterval(() => void flushReport(), REPORT_FLUSH_MS);
    return () => {
      clearInterval(ads);
      clearInterval(reports);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview` is fixed for the life of a preview frame.
  }, [secret, flushAds, flushReport]);

  const startFromIdle = useCallback(() => {
    lastTouchRef.current = Date.now();
    count('session_started');
    dispatch({ type: 'TOUCH' });
  }, [count]);

  const recordAdEvent = useCallback((event: AdEvent) => {
    adQueueRef.current?.add({ clientEventId: eventId(), occurredAt: new Date().toISOString(), ...event });
  }, []);

  useEffect(() => {
    if (!secret) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the initial fetch on pairing is the intentional sync-with-the-server step this effect exists for; setInterval below is the ongoing subscription.
    fetchCatalog();
    fetchContent();
    const interval = setInterval(() => {
      fetchCatalog();
      fetchContent();
    }, CATALOG_POLL_MS);
    return () => clearInterval(interval);
  }, [secret, fetchCatalog, fetchContent]);

  const categories = useMemo(() => {
    if (!catalog) return [];
    const set = new Set<string>();
    for (const item of catalog.items) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [catalog]);

  const origins = useMemo(() => {
    if (!catalog) return [];
    return Array.from(new Set(catalog.items.map((item) => item.origin).filter((o): o is string => Boolean(o))));
  }, [catalog]);

  const visibleItems = useMemo(() => {
    if (!catalog) return [];
    const term = searchTerm.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (category && item.category !== category) return false;
      if (term && !item.name.toLowerCase().includes(term) && !(item.origin ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [catalog, category, searchTerm]);

  const suggestions = useMemo(() => {
    if (!catalog || !detailItem) return [];
    return catalog.items
      .filter((item) => cartKey(item) !== cartKey(detailItem) && item.availabilityState === 'available')
      .sort((a, b) => (a.category === detailItem.category ? -1 : 0) - (b.category === detailItem.category ? -1 : 0))
      .slice(0, 4);
  }, [catalog, detailItem]);

  const cardOptions = useMemo<ProductCardOptions>(() => ({ ...experience.productCard, badges: experience.badges }), [experience]);
  const themeStyle = useMemo(() => kioskThemeStyle(experience), [experience]);
  /** Every screen state renders inside the design's tokens; `contents` keeps the wrapper out of layout while its custom properties still inherit. */
  const themed = (node: React.ReactNode) => (
    <div className={`contents ${experience.theme.motion === 'reduced' ? 'kiosk-reduced-motion' : ''}`} style={{ ...(themeStyle as React.CSSProperties), fontFamily: experience.theme.font === 'system' ? 'system-ui, sans-serif' : undefined }} data-kiosk-design="">
      {node}
    </div>
  );

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  useEffect(() => {
    cartCountRef.current = cartCount;
  }, [cartCount]);
  useEffect(() => {
    if (detailItem) count('product_viewed');
  }, [detailItem, count]);
  const cartTotalKes = cartLines.reduce((sum, line) => sum + line.item.priceKes * line.quantity, 0);

  /** Every unit paid for in this checkout, grouped back by order line — a quantity-2 line's two units can finish independently (one dispensed, one jammed), so progress is reported per line, not assumed uniform. */
  const transactionsByLineKey = useMemo(() => {
    const map = new Map<string, CartTransaction[]>();
    for (const t of cartTransactions) {
      const key = cartKey(t.item);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [cartTransactions]);

  const cartTransactionsDone = cartTransactions.filter((t) => statuses[t.id] && SUCCESS_STATUSES.includes(statuses[t.id])).length;

  function addToCart(item: SellableCatalogItem, delta = 1) {
    if (delta > 0) count('added_to_cart');
    setCart((prev) => {
      const next = new Map(prev);
      const key = cartKey(item);
      const existing = next.get(key);
      const quantity = Math.max(0, (existing?.quantity ?? 0) + delta);
      if (quantity === 0) {
        next.delete(key);
      } else {
        next.set(key, { item, quantity });
      }
      return next;
    });
  }

  function removeFromCart(item: SellableCatalogItem) {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(cartKey(item));
      return next;
    });
  }

  /** Clears the order and everything typed; the caller dispatches where the screen goes next. */
  function resetToBrowse() {
    setDetailItem(null);
    setCart(new Map());
    setCategory(null);
    setSearchTerm('');
    setPhoneDigits('');
    setCheckoutError(null);
    setCartTransactions([]);
    setStatuses({});
    setFailureReasons({});
    fetchCatalog();
  }

  function startCheckout() {
    if (cartLines.length === 0) return;
    setDetailItem(null);
    setCheckoutError(null);
    count('checkout_started');
    dispatch({ type: 'CHECKOUT' });
  }

  // § IDLE — any touch or key counts as someone being here.
  useEffect(() => {
    lastTouchRef.current = Date.now();
    const touched = () => {
      lastTouchRef.current = Date.now();
    };
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('keydown', touched, true);
    return () => {
      window.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('keydown', touched, true);
    };
  }, []);

  useEffect(() => {
    if (!secret || submitting || !idleTimerRuns(runtime)) return;
    lastTouchRef.current = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastTouchRef.current >= idleTimeoutMs) {
        if (cartCountRef.current > 0) count('cart_abandoned');
        resetToBrowse();
        dispatch({ type: 'IDLE_TIMEOUT' });
      }
    }, Math.min(1_000, idleTimeoutMs));
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToBrowse is stable for this kiosk loop; re-running on its identity would restart the idle timer on every render.
  }, [secret, runtime, submitting, idleTimeoutMs]);

  /** One STK push for the whole order — never one per item. Flattens quantities into one `slotId` per physical unit first: a quantity-2 line is two separate vends (one physical motor, one slot, one unit each), even though the customer approved only one M-Pesa prompt for both. */
  async function submitPhoneAndPay() {
    const auth = authRef.current;
    if (!isCompletePhoneNumber(phoneDigits) || cartLines.length === 0 || !auth) return;
    if (preview) {
      setCheckoutError('This is a preview — payments are switched off.');
      return;
    }
    setSubmitting(true);
    setCheckoutError(null);

    const units: SellableCatalogItem[] = [];
    for (const line of cartLines) {
      for (let i = 0; i < line.quantity; i += 1) units.push(line.item);
    }

    try {
      const res = await fetch('/api/vending/payments', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotIds: units.map((item) => item.slotCode), phoneNumber: phoneDigits }),
      });
      const body = (await res.json()) as { transactions?: { id: string; slotId: string }[]; error?: string };
      if (!res.ok || !body.transactions) {
        // § FAILURE SCENARIO — an item in the order went out of stock or was removed from assortment between browsing and checkout: the server re-validates every slot itself, so a stale order line can never actually complete a charge for something no longer sellable.
        setCheckoutError(body.error ?? 'Could not start payment. Some items may no longer be available — go back to the menu to check your order.');
        fetchCatalog();
        return;
      }
      const zipped = body.transactions.map((t, index) => ({ id: t.id, item: units[index] }));
      setCartTransactions(zipped);
      const initialStatuses: Record<string, TransactionStatus> = {};
      for (const t of zipped) initialStatuses[t.id] = 'pending';
      setStatuses(initialStatuses);
      setFailureReasons({});
      count('payment_requested');
      dispatch({ type: 'PAYMENT_REQUESTED' });
    } catch {
      setCheckoutError('Could not reach Snack Quest. Check the connection and try again — nothing has been charged.');
    } finally {
      setSubmitting(false);
    }
  }

  // Polls every transaction the one payment covers, in parallel, until each has reached its own final outcome — the one payment settles together, but each unit's own vend can still succeed or fail independently.
  useEffect(() => {
    if (cartTransactions.length === 0 || !authRef.current) return;
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      const auth = authRef.current;
      if (!auth) return;
      const results = await Promise.all(
        cartTransactions.map(async (t) => {
          try {
            const res = await fetch(`/api/vending/payments/${t.id}`, { headers: { Authorization: auth }, cache: 'no-store' });
            if (!res.ok) return null;
            const body = (await res.json()) as { status: TransactionStatus; failureReason: string | null };
            return { id: t.id, status: body.status, failureReason: body.failureReason };
          } catch {
            // A transient poll failure for this one item — the interval itself keeps trying, never silently gives up on a real charge in flight.
            return null;
          }
        }),
      );
      const known = results.filter((r): r is { id: string; status: TransactionStatus; failureReason: string | null } => r !== null);
      if (known.length > 0) {
        setStatuses((prev) => {
          const next = { ...prev };
          for (const r of known) next[r.id] = r.status;
          return next;
        });
        setFailureReasons((prev) => {
          const next = { ...prev };
          for (const r of known) next[r.id] = r.failureReason;
          return next;
        });
      }
      const allTerminal = known.length === cartTransactions.length && known.every((r) => TERMINAL_STATUSES.includes(r.status));
      if (allTerminal) {
        clearInterval(interval);
      } else if (Date.now() - startedAt > PAYMENT_POLL_TIMEOUT_MS) {
        setStatuses((prev) => {
          const next = { ...prev };
          for (const t of cartTransactions) if (!next[t.id] || !TERMINAL_STATUSES.includes(next[t.id])) next[t.id] = 'manual_review';
          return next;
        });
        setFailureReasons((prev) => {
          const next = { ...prev };
          for (const t of cartTransactions) if (!next[t.id]) next[t.id] = 'This is taking longer than expected. Please contact support if you were charged.';
          return next;
        });
        clearInterval(interval);
      }
    }, PAYMENT_POLL_MS);
    return () => clearInterval(interval);
  }, [cartTransactions]);

  const result = useMemo(() => (cartTransactions.length > 0 ? describeResult(cartTransactions, statuses, failureReasons) : null), [cartTransactions, statuses, failureReasons]);

  // The payment cleared once any unit has moved past waiting for it.
  const paymentCleared = cartTransactions.some((t) => statuses[t.id] && !['pending', 'paid', 'payment_failed'].includes(statuses[t.id]));
  useEffect(() => {
    if (paymentCleared) dispatch({ type: 'PAYMENT_RECEIVED' });
  }, [paymentCleared]);

  useEffect(() => {
    if (cartTransactions.length === 0) return;
    const allTerminal = cartTransactions.every((t) => statuses[t.id] && TERMINAL_STATUSES.includes(statuses[t.id]));
    if (allTerminal) {
      // Switching to the result screen is the reaction to every unit's own final status landing.
      const outcome = outcomeOf(cartTransactions.map((t) => statuses[t.id]));
      count(outcome === 'success' ? 'order_succeeded' : 'order_failed');
      dispatch({ type: 'FINISHED', outcome });
      const everythingDispensed = cartTransactions.every((t) => statuses[t.id] === 'dispensed');
      const timeout = setTimeout(
        () => {
          resetToBrowse();
          dispatch({ type: 'DONE' });
        },
        everythingDispensed ? RESULT_DISPLAY_SUCCESS_MS : RESULT_DISPLAY_ISSUE_MS,
      );
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToBrowse is stable for this kiosk loop; re-running on its identity would restart the reset timer needlessly.
  }, [statuses, cartTransactions]);

  /** § KIOSK SERVICE MODE: the server checks the code; the screen only opens when nobody is mid-purchase. */
  async function openServiceMode(code: string): Promise<string | null> {
    const auth = authRef.current;
    if (!auth) return 'This screen isn’t paired.';
    if (!kioskTransition(runtime, { type: 'SERVICE_START' }).accepted) return 'Finish or cancel the current order first.';
    try {
      const res = await fetch(`/api/vending/machines/${machineId}/service-session`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const body = (await res.json().catch(() => ({}))) as { sessionExpiresAt?: string; error?: string };
      if (!res.ok || !body.sessionExpiresAt) return body.error ?? 'That code didn’t work.';
      resetToBrowse();
      setServicePrompt(false);
      setServiceExpiresAt(new Date(body.sessionExpiresAt).getTime());
      count('service_opened');
      dispatch({ type: 'SERVICE_START' });
      return null;
    } catch {
      return 'Can’t reach Snack Quest to check the code.';
    }
  }
  const serviceGesture = preview ? undefined : () => setServicePrompt(true);
  const servicePromptNode = servicePrompt ? <ServiceCodePrompt onSubmit={openServiceMode} onCancel={() => setServicePrompt(false)} /> : null;

  if (!secret) {
    return themed(
      <main className="flex min-h-dvh items-center justify-center bg-kiosk-stage p-6">
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl bg-surface p-8 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed public asset. */}
          <img src="/logo.png" alt="" className="size-20 rounded-lg" />
          <div className="flex flex-col gap-2">
            <h1 className="text-card-title font-semibold text-foreground">Pair {machineCode}</h1>
            <p className="text-small text-muted-foreground">Enter this machine&apos;s device secret once, at installation, to switch on its screen.</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = pairingInput.trim();
              if (!trimmed) {
                setPairingError('Enter this machine’s device secret to pair the screen.');
                return;
              }
              window.localStorage.setItem(`${PAIRING_KEY_PREFIX}${machineId}`, trimmed);
              setPairingError(null);
              setSecret(trimmed);
            }}
            className="flex flex-col gap-4"
          >
            <Input type="password" autoComplete="off" aria-label="Device secret" placeholder="Device secret" value={pairingInput} onChange={(event) => setPairingInput(event.target.value)} />
            {pairingError ? (
              <p role="alert" className="text-small text-danger">
                {pairingError}
              </p>
            ) : null}
            <Button type="submit" size="lg">
              Pair this screen
            </Button>
          </form>
        </div>
      </main>
    );
  }

  if (runtime === 'MAINTENANCE' && serviceExpiresAt) {
    return themed(
      <ServiceScreen
        getInfo={() => ({
          machineCode,
          online: !offline,
          packageVersion: packageVersionRef.current,
          catalogVersion: catalogVersionRef.current,
          lastContentAt,
          campaigns: ads.campaigns.length,
          cachedCreatives: Object.keys(adMedia).length,
          pendingAdEvents: adQueueRef.current?.size() ?? 0,
          pendingReports: metricQueueRef.current?.size() ?? 0,
          droppedEvents: (adQueueRef.current?.dropped() ?? 0) + (metricQueueRef.current?.dropped() ?? 0),
        })}
        expiresAt={serviceExpiresAt}
        onSync={async () => {
          packageVersionRef.current = null;
          await Promise.all([fetchCatalog(), fetchContent()]);
        }}
        onFlush={async () => {
          await flushAds();
          await flushReport();
        }}
        onClearCache={async () => {
          await clearMediaCache();
          for (const { url } of mediaRef.current.values()) URL.revokeObjectURL?.(url);
          mediaRef.current.clear();
          setAdMedia({});
        }}
        onExit={() => {
          setServiceExpiresAt(null);
          dispatch({ type: 'SERVICE_END' });
        }}
      />,
    );
  }

  if (attract) {
    const idleScreen = <AttractScreen headline={experience.copy.attractHeadline} callToAction={experience.copy.attractCallToAction} images={screen.attract} items={catalog?.items ?? []} onStart={startFromIdle} />;
    // § ATTRACT MODE: ads only where the design allows them and only verified files; otherwise the normal idle screen.
    if (experience.idle.adsEnabled && !preview && ads.campaigns.length > 0 && Object.keys(adMedia).length > 0) {
      return themed(<AdPlayer playlist={ads} media={adMedia} rotationKey={`sq_kiosk_ad_rotation_${machineId}`} onEvent={recordAdEvent} onTap={startFromIdle} fallback={idleScreen} />);
    }
    return themed(idleScreen);
  }

  if (view === 'result' && result) {
    const ResultIcon = result.tone === 'success' ? Check : result.tone === 'danger' ? X : result.tone === 'warning' ? AlertTriangle : RotateCcw;
    const toneClass = { success: 'bg-success text-success-foreground', warning: 'bg-warning text-warning-foreground', danger: 'bg-danger text-danger-foreground', neutral: 'bg-secondary text-secondary-foreground' }[result.tone];
    return themed(
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
        <div className={`flex size-36 items-center justify-center rounded-full shadow-md lg:size-44 ${toneClass}`}>
          <ResultIcon className="size-20 lg:size-24" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div role="status" className="flex max-w-2xl flex-col gap-4">
          <h1 className="font-display text-section-title leading-tight text-foreground text-balance lg:text-page-title">{result.title}</h1>
          <p className="text-subtitle text-muted-foreground">{result.body}</p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            resetToBrowse();
            dispatch({ type: 'DONE' });
          }}
          className="h-14 px-10"
        >
          Back to menu
        </Button>
      </main>
    );
  }

  if (view === 'paying') {
    const anyDispensing = cartTransactions.some((t) => statuses[t.id] && !['pending', 'paid'].includes(statuses[t.id]));
    const steps = [
      { label: 'Request sent', done: true },
      { label: 'Enter your PIN', done: anyDispensing },
      { label: 'Collect your snacks', done: false },
    ];
    const currentStep = anyDispensing ? 2 : 1;
    return themed(
      <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-16">
        <div className="relative flex size-36 items-center justify-center lg:size-44">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/15 motion-reduce:animate-none" aria-hidden="true" />
          <span className="relative flex size-full items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            {anyDispensing ? <Check className="size-20" strokeWidth={2.5} aria-hidden="true" /> : <Smartphone className="size-20" aria-hidden="true" />}
          </span>
        </div>

        <div role="status" className="flex max-w-2xl flex-col gap-4 text-center">
          <h1 className="font-display text-section-title leading-tight text-foreground lg:text-page-title">{anyDispensing ? 'Payment received' : 'Check your phone'}</h1>
          <p className="text-subtitle text-muted-foreground">
            {anyDispensing ? (
              'Your snacks are on their way down — collect them from the tray below.'
            ) : (
              <>
                Enter your M-Pesa PIN on <span className="font-semibold text-foreground tabular-nums">{formatPhoneNumber(phoneDigits)}</span> to pay{' '}
                <span className="font-semibold text-foreground">{formatKes(cartTotalKes)}</span> for your whole order.
              </>
            )}
          </p>
        </div>

        <ol className="flex w-full max-w-2xl items-start">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            return (
              <li key={step.label} className="flex flex-1 flex-col items-center gap-3 text-center">
                <span
                  className={`flex size-12 items-center justify-center rounded-full text-body font-bold ${step.done ? 'bg-success text-success-foreground' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-border text-muted-foreground'}`}
                >
                  {step.done ? <Check className="size-6" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`text-small ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                  {isCurrent ? <span className="sr-only"> (now)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>

        <section aria-label="Order progress" className="flex w-full max-w-2xl flex-col gap-4 rounded-xl bg-surface p-6 shadow-sm">
          {cartLines.map((line) => {
            const units = transactionsByLineKey.get(cartKey(line.item)) ?? [];
            const doneCount = units.filter((t) => statuses[t.id] && SUCCESS_STATUSES.includes(statuses[t.id])).length;
            const failedCount = units.filter((t) => statuses[t.id] && TERMINAL_STATUSES.includes(statuses[t.id]) && !SUCCESS_STATUSES.includes(statuses[t.id])).length;
            const state = failedCount > 0 ? 'failed' : doneCount === line.quantity ? 'done' : 'waiting';
            return (
              <div key={cartKey(line.item)} className="flex items-center gap-4">
                <div className="size-14 shrink-0 overflow-hidden rounded-md bg-background p-1.5">
                  <ProductImage item={line.item} />
                </div>
                <p className="flex-1 text-body text-foreground">
                  {line.item.name} &times; {line.quantity}
                  {line.quantity > 1 && doneCount > 0 ? <span className="text-muted-foreground"> ({doneCount}/{line.quantity} done)</span> : null}
                </p>
                {state === 'done' ? (
                  <Check className="size-6 text-success" aria-label="Dispensed" />
                ) : state === 'failed' ? (
                  <CircleSlash className="size-6 text-danger" aria-label="Problem" />
                ) : (
                  <Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Waiting" />
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-body text-muted-foreground">{cartTransactions.length > 1 ? `${cartTransactionsDone} of ${cartTransactions.length} items done` : 'Total'}</span>
            <span className="text-card-title font-bold tabular-nums text-foreground">{formatKes(cartTotalKes)}</span>
          </div>
        </section>
      </main>
    );
  }

  if (view === 'checkout') {
    const phoneReady = isCompletePhoneNumber(phoneDigits);
    return themed(
      <div className="flex h-dvh flex-col bg-background">
        <KioskTopBar machineCode={machineCode} offline={offline} onServiceGesture={serviceGesture}>
          <Button variant="outline" size="lg" onClick={() => dispatch({ type: 'BACK' })} className="h-12 rounded-full" disabled={submitting}>
            <ArrowLeft aria-hidden="true" />
            Back to menu
          </Button>
        </KioskTopBar>
        <main className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mx-auto my-auto grid w-full max-w-3xl gap-6 lg:gap-8 landscape:lg:max-w-5xl landscape:lg:grid-cols-[1fr_1.15fr]">
            <section aria-labelledby="order-heading" className="flex flex-col gap-6 rounded-xl bg-surface p-6 shadow-sm lg:p-8">
              <h2 id="order-heading" className="text-card-title font-semibold text-foreground">
                Your order
              </h2>
              <ul className="flex flex-col gap-4">
                {cartLines.map((line) => (
                  <li key={cartKey(line.item)} className="flex items-center gap-4">
                    <div className="size-14 shrink-0 overflow-hidden rounded-md bg-background p-2">
                      <ProductImage item={line.item} />
                    </div>
                    <p className="flex-1 text-body text-foreground">
                      {line.item.name} <span className="text-muted-foreground">&times; {line.quantity}</span>
                    </p>
                    <span className="text-body font-semibold tabular-nums text-foreground">{formatKes(line.item.priceKes * line.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-subtitle font-semibold text-foreground">Total</span>
                <span className="text-section-title font-bold tabular-nums text-foreground">{formatKes(cartTotalKes)}</span>
              </div>
            </section>

            <section aria-labelledby="pay-heading" className="flex flex-col gap-6 rounded-xl bg-surface p-6 shadow-sm lg:p-8">
              <div className="flex flex-col gap-2">
                <h2 id="pay-heading" className="text-card-title font-semibold text-foreground">
                  Pay with M-Pesa
                </h2>
                <p className="text-body text-muted-foreground">Enter the phone number that should get the payment request.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="mpesa-number" className="text-small font-medium text-foreground">
                  M-Pesa number
                </label>
                <input
                  id="mpesa-number"
                  type="tel"
                  inputMode="none"
                  autoComplete="off"
                  placeholder="07XXXXXXXX"
                  value={formatPhoneNumber(phoneDigits)}
                  onChange={(event) => setPhoneDigits(event.target.value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS))}
                  className="h-16 w-full rounded-lg border border-border bg-background px-5 text-card-title font-semibold tracking-wide tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary lg:h-20 lg:text-section-title"
                />
              </div>
              <PhoneKeypad digits={phoneDigits} onChange={setPhoneDigits} disabled={submitting} />
              {checkoutError ? (
                <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-small text-danger">
                  {checkoutError}
                </p>
              ) : null}
              <Button size="lg" onClick={submitPhoneAndPay} loading={submitting} disabled={!phoneReady} className="h-16 text-subtitle">
                <Smartphone aria-hidden="true" />
                Send payment request
              </Button>
              <p className="text-small text-muted-foreground">One M-Pesa prompt covers your whole order. Nothing is charged until you enter your PIN on your phone.</p>
            </section>
          </div>
        </main>
        {servicePromptNode}
      </div>
    );
  }

  const heading = searchTerm.trim() ? `Results for “${searchTerm.trim()}”` : (category ?? 'All snacks');

  return themed(
    <div className="flex h-dvh flex-col bg-background">
      <KioskTopBar machineCode={machineCode} offline={offline} onServiceGesture={serviceGesture}>
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search snacks" placeholder="Search snacks" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-12 rounded-full bg-surface pl-11 text-body" />
        </div>
      </KioskTopBar>

      <main className="flex-1 overflow-y-auto">
        {experience.browseSections
          .filter((section) => section.visible)
          .map((section) => {
            switch (section.type) {
              case 'menu_banner':
                return (
                  <Fragment key={section.id}>
                    <div className="px-4 pt-4 sm:px-6 lg:px-8">
                      <MenuBanner images={screen.menu_banner} origins={origins} eyebrow={experience.copy.bannerEyebrow} headline={experience.copy.bannerHeadline} />
                    </div>

                  </Fragment>
                );
              case 'promo_message':
                return <PromoStrip key={section.id} section={section} />;
              case 'featured_products':
                return searchTerm.trim() || category ? null : (
                  <FeaturedRow
                    key={section.id}
                    section={section}
                    items={(catalog?.items ?? []).filter((item) => item.promotionalState === 'featured' && item.availabilityState === 'available')}
                    cart={cart}
                    options={cardOptions}
                    onOpen={setDetailItem}
                    onQuickAdd={(item) => addToCart(item, 1)}
                  />
                );
              case 'category_bar':
                return (
                  <Fragment key={section.id}>
                    {catalog && categories.length > 0 ? (
                      <nav aria-label="Categories" className="sticky top-0 z-10 bg-background/95 py-4 backdrop-blur-sm">
                        <ul className="flex gap-3 overflow-x-auto px-4 sm:px-6 lg:px-8">
                          <li>
                            <CategoryChip label="All" active={category === null} onClick={() => setCategory(null)} />
                          </li>
                          {categories.map((cat) => (
                            <li key={cat}>
                              <CategoryChip label={cat} active={category === cat} onClick={() => setCategory(cat)} />
                            </li>
                          ))}
                        </ul>
                      </nav>
                    ) : (
                      <div className="h-6" />
                    )}

                  </Fragment>
                );
              case 'product_grid':
                return (
                  <Fragment key={section.id}>
                    <section aria-labelledby="menu-heading" className="px-4 pb-10 sm:px-6 lg:px-8">
                      {catalog ? (
                        <>
                          <div className="mb-4 flex items-baseline justify-between gap-4">
                            <h2 id="menu-heading" className="text-card-title font-semibold text-foreground">
                              {heading}
                            </h2>
                            <p className="text-small text-muted-foreground">
                              {visibleItems.length} {visibleItems.length === 1 ? 'snack' : 'snacks'}
                            </p>
                          </div>
                          {visibleItems.length === 0 ? (
                            <div className="flex flex-col items-center gap-4 rounded-xl bg-surface px-6 py-16 text-center">
                              <p className="text-subtitle font-semibold text-foreground">No snacks match that.</p>
                              <p className="text-body text-muted-foreground">Try another word, or look through every snack.</p>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSearchTerm('');
                                  setCategory(null);
                                }}
                              >
                                Show all snacks
                              </Button>
                            </div>
                          ) : (
                            <div className={`grid gap-4 lg:gap-6 ${GRID_COLUMNS[String(section.props.columns ?? 'auto')] ?? GRID_COLUMNS.auto}`}>
                              {visibleItems.map((item) => (
                                <ProductCard
                                  key={cartKey(item)}
                                  item={item}
                                  quantityInCart={cart.get(cartKey(item))?.quantity ?? 0}
                                  onOpen={() => setDetailItem(item)}
                                  onQuickAdd={() => addToCart(item, 1)}
                                  options={cardOptions}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      ) : catalogError ? (
                        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface px-6 py-16 text-center">
                          <WifiOff className="size-10 text-muted-foreground" aria-hidden="true" />
                          <p className="text-subtitle font-semibold text-foreground">The menu isn&apos;t available right now.</p>
                          <p className="text-body text-muted-foreground">This machine can&apos;t reach Snack Quest. It will try again on its own.</p>
                        </div>
                      ) : (
                        <div aria-label="Loading the menu" role="status" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-6 xl:grid-cols-4">
                          {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="flex flex-col gap-3 rounded-lg bg-surface p-3 shadow-sm lg:p-4">
                              <div className="aspect-square animate-pulse rounded-md bg-border/50 motion-reduce:animate-none" />
                              <div className="h-5 w-3/4 animate-pulse rounded-full bg-border/50 motion-reduce:animate-none" />
                              <div className="h-6 w-1/3 animate-pulse rounded-full bg-border/50 motion-reduce:animate-none" />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </Fragment>
                );
            }
          })}
      </main>

      <OrderBar
        lines={cartLines}
        count={cartCount}
        totalKes={cartTotalKes}
        onChange={addToCart}
        onRemove={removeFromCart}
        onClear={() => setCart(new Map())}
        onPay={startCheckout}
      />

      {detailItem ? (
        <ProductSheet
          key={cartKey(detailItem)}
          item={detailItem}
          quantityInCart={cart.get(cartKey(detailItem))?.quantity ?? 0}
          suggestions={suggestions}
          onClose={() => setDetailItem(null)}
          onAdd={(quantity) => {
            addToCart(detailItem, quantity);
            setDetailItem(null);
          }}
          onOpenSuggestion={setDetailItem}
        />
      ) : null}
      {servicePromptNode}
    </div>
  );
}

function KioskTopBar({ machineCode, offline, onServiceGesture, children }: { machineCode: string; offline: boolean; onServiceGesture?: () => void; children?: React.ReactNode }) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
  };
  return (
    <header className="flex items-center gap-4 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      {/* Press and hold the logo for service mode (staff, with a one-time code). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed public asset. */}
      <img
        src="/logo.png"
        alt=""
        className="size-12 shrink-0 select-none rounded-md lg:size-14"
        draggable={false}
        onPointerDown={() => {
          if (!onServiceGesture) return;
          cancelHold();
          holdRef.current = setTimeout(onServiceGesture, SERVICE_HOLD_MS);
        }}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div className="hidden flex-col sm:flex">
        <span className="text-body font-bold text-foreground lg:text-subtitle">Snack Quest</span>
        <span className="text-caption text-muted-foreground">Machine {machineCode}</span>
      </div>
      <div className="hidden flex-1 sm:block" />
      {offline ? (
        <span className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-2 text-small font-medium text-danger">
          <WifiOff className="size-4" aria-hidden="true" />
          Offline — showing the last menu
        </span>
      ) : null}
      {children}
    </header>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-12 shrink-0 whitespace-nowrap rounded-full px-6 text-body font-semibold transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
        active ? 'bg-foreground text-background' : 'bg-surface text-foreground shadow-sm hover:bg-border/40'
      }`}
    >
      {label}
    </button>
  );
}

function QuantityStepper({ label, quantity, onChange, size = 'md' }: { label: string; quantity: number; onChange: (delta: number) => void; size?: 'md' | 'lg' }) {
  const button = size === 'lg' ? 'size-14' : 'size-10';
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(-1)}
        aria-label={`Remove one ${label}`}
        className={`flex ${button} items-center justify-center rounded-full bg-surface text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-border/50`}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className={`text-center font-semibold tabular-nums text-foreground ${size === 'lg' ? 'w-10 text-card-title' : 'w-6 text-body'}`}>{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label={`Add one more ${label}`}
        className={`flex ${button} items-center justify-center rounded-full bg-surface text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-border/50`}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The order, always in view along the bottom of the menu (the way a
 * shop counter shows the basket): every line with its own +/−, the one
 * total, and the one way forward — Pay.
 */
function OrderBar({
  lines,
  count,
  totalKes,
  onChange,
  onRemove,
  onClear,
  onPay,
}: {
  lines: CartLine[];
  count: number;
  totalKes: number;
  onChange: (item: SellableCatalogItem, delta: number) => void;
  onRemove: (item: SellableCatalogItem) => void;
  onClear: () => void;
  onPay: () => void;
}) {
  return (
    <section aria-label="Your order" className="border-t border-border bg-surface px-4 py-4 shadow-lg sm:px-6 lg:px-8 lg:py-6">
      {lines.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-2 text-body text-muted-foreground">
          Tap
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <Plus className="size-4" />
          </span>
          <span className="sr-only">the plus button</span>
          on a snack to start your order.
        </p>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-6">
          <ul className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
            {lines.map((line) => (
              <li key={cartKey(line.item)} className="flex shrink-0 items-center gap-3 rounded-lg bg-background py-2 pl-2 pr-3">
                <div className="size-14 shrink-0 overflow-hidden rounded-md bg-surface p-1">
                  <ProductImage item={line.item} />
                </div>
                <div className="flex w-28 flex-col lg:w-36">
                  <span className="line-clamp-1 text-small font-semibold text-foreground">{line.item.name}</span>
                  <span className="text-small tabular-nums text-muted-foreground">{formatKes(line.item.priceKes * line.quantity)}</span>
                </div>
                <QuantityStepper label={line.item.name} quantity={line.quantity} onChange={(delta) => onChange(line.item, delta)} />
                <button
                  type="button"
                  onClick={() => onRemove(line.item)}
                  aria-label={`Remove ${line.item.name} from cart`}
                  className="flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onClear}
              className="h-12 shrink-0 rounded-full px-3 text-small font-medium text-muted-foreground outline-none hover:bg-border/40 focus-visible:ring-2 focus-visible:ring-primary sm:px-4"
            >
              Clear<span className="hidden sm:inline"> order</span>
            </button>
            <div className="ml-auto flex flex-col items-end xl:ml-0">
              <span className="text-caption text-muted-foreground">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
              <span className="whitespace-nowrap text-subtitle font-bold tabular-nums text-foreground sm:text-card-title">{formatKes(totalKes)}</span>
            </div>
            <Button size="lg" onClick={onPay} className="h-14 shrink-0 px-5 text-body sm:px-8 sm:text-subtitle">
              Pay<span className="hidden sm:inline"> with M-Pesa</span>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Everything about one product, over the menu: tap outside or Close to go back, Add to put it in the order. */
function ProductSheet({
  item,
  quantityInCart,
  suggestions,
  onClose,
  onAdd,
  onOpenSuggestion,
}: {
  item: SellableCatalogItem;
  quantityInCart: number;
  suggestions: SellableCatalogItem[];
  onClose: () => void;
  onAdd: (quantity: number) => void;
  onOpenSuggestion: (item: SellableCatalogItem) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const purchasable = item.availabilityState === 'available';

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/50 animate-fade-in sm:items-center sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-sheet-title"
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col gap-8 overflow-y-auto rounded-t-xl bg-surface p-6 shadow-lg animate-sheet-up sm:rounded-xl sm:p-8 sm:animate-scale-up motion-reduce:animate-none"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex size-12 items-center justify-center rounded-full bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-6" aria-hidden="true" />
        </button>

        <div className="grid gap-8 sm:grid-cols-2">
          <div className={`aspect-square overflow-hidden rounded-lg bg-background p-8 ${purchasable ? '' : 'grayscale'}`}>
            <ProductImage item={item} />
          </div>
          <div className="flex flex-col gap-4">
            {item.origin ? (
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-kiosk-highlight px-3 py-1.5 text-small font-semibold text-kiosk-highlight-foreground">
                <MapPin className="size-4" aria-hidden="true" />
                From {item.origin}
              </span>
            ) : null}
            <h2 id="product-sheet-title" className="pr-12 text-card-title font-bold leading-tight text-foreground text-balance lg:text-section-title">
              {item.name}
            </h2>
            {item.description ? <p className="text-body text-muted-foreground lg:text-subtitle">{item.description}</p> : null}
            <span className="text-card-title font-bold tabular-nums text-foreground">{formatKes(item.priceKes)}</span>

            <div className="mt-auto flex flex-col gap-4 pt-2">
              {purchasable ? (
                <>
                  <div className="flex items-center justify-between rounded-lg bg-background p-2 pl-4">
                    <span className="text-body text-muted-foreground">{quantityInCart > 0 ? `${quantityInCart} already in your order` : 'How many?'}</span>
                    <QuantityStepper label={item.name} quantity={quantity} size="lg" onChange={(delta) => setQuantity((q) => Math.max(1, Math.min(9, q + delta)))} />
                  </div>
                  <Button size="lg" onClick={() => onAdd(quantity)} className="h-16 text-subtitle">
                    Add to order · {formatKes(item.priceKes * quantity)}
                  </Button>
                </>
              ) : (
                <p className="flex items-center gap-2 rounded-lg bg-background px-4 py-4 text-body font-medium text-muted-foreground">
                  <CircleSlash className="size-5" aria-hidden="true" />
                  {STATE_LABEL[item.availabilityState]} — try another snack.
                </p>
              )}
            </div>
          </div>
        </div>

        {suggestions.length > 0 ? (
          <div className="flex flex-col gap-4 border-t border-border pt-6">
            <h3 className="text-subtitle font-semibold text-foreground">You might also like</h3>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {suggestions.map((suggestion) => (
                <li key={cartKey(suggestion)}>
                  <button
                    type="button"
                    onClick={() => onOpenSuggestion(suggestion)}
                    className="flex w-full flex-col gap-2 rounded-lg p-2 text-left outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="aspect-square overflow-hidden rounded-md bg-background p-3">
                      <ProductImage item={suggestion} />
                    </div>
                    <span className="line-clamp-2 text-small font-medium text-foreground">{suggestion.name}</span>
                    <span className="text-small font-bold tabular-nums text-foreground">{formatKes(suggestion.priceKes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A one-line message across the menu (§ KIOSK EXPERIENCE: "Message strip"). Text only — the builder never allows markup. */
function PromoStrip({ section }: { section: KioskSection }) {
  if (!section.props.text) return null;
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <p role="note" className={`rounded-lg px-5 py-3 text-center text-body font-semibold ${TONE_CLASS[section.props.tone ?? 'highlight']}`}>
        {section.props.text}
      </p>
    </div>
  );
}

/** Snacks staff marked "featured" on this machine, in a row above the menu. Hidden when there are none, or while the customer is searching or filtering. */
function FeaturedRow({
  section,
  items,
  cart,
  options,
  onOpen,
  onQuickAdd,
}: {
  section: KioskSection;
  items: SellableCatalogItem[];
  cart: Map<string, CartLine>;
  options: ProductCardOptions;
  onOpen: (item: SellableCatalogItem) => void;
  onQuickAdd: (item: SellableCatalogItem) => void;
}) {
  const shown = items.slice(0, section.props.limit ?? 4);
  if (shown.length === 0) return null;
  const headingId = `featured-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="px-4 pt-6 sm:px-6 lg:px-8">
      <h2 id={headingId} className="mb-4 text-card-title font-semibold text-foreground">
        {section.props.title ?? 'Featured'}
      </h2>
      <ul className="flex gap-4 overflow-x-auto pb-2">
        {shown.map((item) => (
          <li key={cartKey(item)} className="w-44 shrink-0 lg:w-56">
            <ProductCard item={item} quantityInCart={cart.get(cartKey(item))?.quantity ?? 0} onOpen={() => onOpen(item)} onQuickAdd={() => onQuickAdd(item)} options={options} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type ResultTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * The one payment settles together, but each unit's own vend can
 * still land differently — one dispensed, one jammed, one still stuck
 * in `manual_review` — so this summarizes across every transaction the
 * order's one STK push covered rather than describing a single status.
 */
function describeResult(
  cartTransactions: CartTransaction[],
  statuses: Record<string, TransactionStatus>,
  failureReasons: Record<string, string | null>,
): { tone: ResultTone; title: string; body: string } {
  const total = cartTransactions.length;
  const statusOf = (t: CartTransaction) => statuses[t.id];
  const dispensed = cartTransactions.filter((t) => statusOf(t) === 'dispensed').length;
  const paymentFailed = cartTransactions.filter((t) => statusOf(t) === 'payment_failed').length;
  const refunded = cartTransactions.filter((t) => statusOf(t) === 'refunded').length;
  const failedOrReview = cartTransactions.filter((t) => statusOf(t) === 'paid_vend_failed' || statusOf(t) === 'manual_review');
  const representativeReason = failedOrReview.map((t) => failureReasons[t.id]).find(Boolean) ?? null;

  if (paymentFailed === total) {
    return { tone: 'danger', title: 'Payment was not completed', body: failureReasons[cartTransactions[0].id] ?? 'Please try again.' };
  }
  if (refunded === total) {
    return { tone: 'neutral', title: 'Your payment was refunded', body: 'Nothing from this order was dispensed.' };
  }
  if (dispensed === total) {
    return {
      tone: 'success',
      title: total > 1 ? 'All done — enjoy your snacks!' : 'Enjoy your snack!',
      body: total > 1 ? 'Collect them from the tray below.' : 'Collect it from the tray below.',
    };
  }
  if (dispensed > 0) {
    return {
      tone: 'warning',
      title: `${dispensed} of ${total} items dispensed`,
      body: `${failedOrReview.length} had an issue${representativeReason ? `: ${representativeReason}` : '.'} If you were charged for those, support will follow up.`,
    };
  }
  if (cartTransactions.some((t) => statusOf(t) === 'manual_review')) {
    return { tone: 'warning', title: 'We’re checking on your order', body: representativeReason ?? 'If you were charged, support will follow up.' };
  }
  return { tone: 'danger', title: 'We couldn’t dispense your order', body: representativeReason ?? 'Please contact support for a refund.' };
}
