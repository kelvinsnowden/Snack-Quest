/**
 * Snack Quest Attribution & Growth Engine - Client Tracking Library
 * Handles session creation, UTM/Click parameter persistence, scroll tracking,
 * WhatsApp session persistence, and shared event_id deduplication.
 */

import { AttributionParams, MarketingEventType } from '../types/attribution';

const SESSION_STORAGE_KEY = 'snackquest_session_id';
const FIRST_TOUCH_KEY = 'snackquest_attribution_first_touch';
const LAST_TOUCH_KEY = 'snackquest_attribution_last_touch';

/**
 * Generates or retrieves persistent session ID
 */
export function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = `sq_sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Helper to parse URL query params
 */
export function captureUrlParameters(): AttributionParams {
  if (typeof window === 'undefined') return {};

  const urlParams = new URLSearchParams(window.location.search);
  const nowIso = new Date().toISOString();

  const params: AttributionParams = {
    fbclid: urlParams.get('fbclid') || urlParams.get('fbc'),
    gclid: urlParams.get('gclid'),
    ttclid: urlParams.get('ttclid'),
    msclkid: urlParams.get('msclkid'),
    utm_source: urlParams.get('utm_source'),
    utm_medium: urlParams.get('utm_medium'),
    utm_campaign: urlParams.get('utm_campaign'),
    utm_content: urlParams.get('utm_content'),
    utm_term: urlParams.get('utm_term'),
    landing_page: window.location.pathname + window.location.search,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc') || urlParams.get('fbclid') ? `fb.1.${Date.now()}.${urlParams.get('fbclid')}` : null
  };

  // Check if params exist
  const hasMarketingParams =
    params.fbclid || params.gclid || params.ttclid || params.utm_source || params.utm_campaign;

  if (hasMarketingParams) {
    // Save First Touch if not exists
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
      const firstTouch = { ...params, first_touch_timestamp: nowIso };
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
    }

    // Always update Last Touch
    const lastTouch = { ...params, last_touch_timestamp: nowIso };
    localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(lastTouch));
  }

  return params;
}

/**
 * Read cookie helper
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

/**
 * Retrieve First-Touch Attribution
 */
export function getFirstTouchAttribution(): AttributionParams {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Retrieve Last-Touch Attribution
 */
export function getLastTouchAttribution(): AttributionParams {
  try {
    const raw = localStorage.getItem(LAST_TOUCH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Generates unique event_id for Meta CAPI & Pixel Deduplication
 */
export function generateEventId(eventName: string): string {
  const sessionId = getOrCreateSessionId().substring(0, 8);
  const timestamp = Date.now();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `evt_${eventName.toLowerCase()}_${sessionId}_${timestamp}_${random}`;
}

/**
 * Browser Environment Metadata
 */
export function getBrowserMetadata() {
  if (typeof window === 'undefined') {
    return {
      device_type: 'Unknown',
      browser: 'Unknown',
      os: 'Unknown',
      screen_size: '1920x1080',
      language: 'en-US'
    };
  }

  const ua = navigator.userAgent;
  let deviceType = 'Desktop';
  if (/mobile/i.test(ua)) deviceType = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet';

  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = 'Windows';
  if (ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return {
    device_type: deviceType,
    browser,
    os,
    screen_size: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language || 'en-US'
  };
}

/**
 * Primary Client-Side Tracking Function
 */
export async function trackEvent(
  eventName: MarketingEventType,
  customData: {
    value_kes?: number;
    order_id?: string;
    customer_id?: string;
    email?: string;
    phone?: string;
    [key: string]: any;
  } = {}
) {
  if (typeof window === 'undefined') return;

  const sessionId = getOrCreateSessionId();
  const urlParams = captureUrlParameters();
  const browserMeta = getBrowserMetadata();
  const eventId = generateEventId(eventName);
  const firstTouch = getFirstTouchAttribution();
  const lastTouch = getLastTouchAttribution();

  const combinedParams: AttributionParams = {
    ...firstTouch,
    ...lastTouch,
    ...urlParams,
    landing_page: window.location.pathname + window.location.search
  };

  const eventPayload = {
    event_id: eventId,
    event_name: eventName,
    session_id: sessionId,
    customer_id: customData.customer_id || null,
    order_id: customData.order_id || null,
    timestamp: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || 'Direct',
    ...browserMeta,
    value_kes: customData.value_kes || 0,
    attribution_params: combinedParams,
    user_data: {
      email: customData.email || null,
      phone: customData.phone || null,
      fbp: combinedParams.fbp,
      fbc: combinedParams.fbc
    },
    custom_data: customData
  };

  // Attempt Meta Pixel Browser Dispatch if window.fbq exists
  if ((window as any).fbq) {
    try {
      (window as any).fbq('track', eventName, {
        value: customData.value_kes || 0,
        currency: 'KES',
        order_id: customData.order_id
      }, { eventID: eventId });
    } catch (e) {
      console.warn('Meta Pixel browser dispatch warning:', e);
    }
  }

  // Dispatch to Server CAPI Engine
  try {
    await fetch('/api/v1/marketing/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });
  } catch (err) {
    console.error('Attribution server track error:', err);
  }

  return eventId;
}

/**
 * Initializes automatic Scroll Depth tracking (25%, 50%, 75%, 90%)
 */
export function initScrollTracking() {
  if (typeof window === 'undefined') return;

  const thresholds = [25, 50, 75, 90];
  const fired = new Set<number>();

  const handleScroll = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollPercent = Math.round((scrollTop / docHeight) * 100);

    thresholds.forEach((threshold) => {
      if (scrollPercent >= threshold && !fired.has(threshold)) {
        fired.add(threshold);
        trackEvent('ScrollDepth', { scroll_depth_percent: threshold });
      }
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => window.removeEventListener('scroll', handleScroll);
}

/**
 * Formats WhatsApp Link with session preservation code
 */
export function formatWhatsAppUrl(phoneNumber: string = '254700000000', customMessage: string = 'Hi Snack Quest! I want to order a box.'): string {
  const sessionId = getOrCreateSessionId();
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const refMessage = `${customMessage}\n\n[Ref Session: ${sessionId}]`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(refMessage)}`;
}
