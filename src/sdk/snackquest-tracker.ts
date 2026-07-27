/**
 * Snack Quest Operating System - Production Landing Page SDK
 * Version: 1.0.0
 * 
 * Provides end-to-end customer journey tracking, session management,
 * offline event queuing, attribution persistence, heatmaps, and WhatsApp handoff.
 */

export interface SnackQuestInitOptions {
  apiUrl: string;
  landingPageId: string;
  environment?: 'production' | 'sandbox' | 'development';
  autoTrack?: boolean;
  debug?: boolean;
}

export interface TrackEventOptions {
  event: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, any>;
  eventId?: string;
}

export interface VisitorProfile {
  visitor_id: string;
  session_id: string;
  browser: string;
  os: string;
  device_type: string;
  screen_resolution: string;
  viewport_size: string;
  timezone: string;
  language: string;
  connection_type: string;
  dark_mode: boolean;
  pwa_installed: boolean;
  user_agent: string;
}

export interface AttributionData {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_page_id?: string;
  ref_code?: string | null;
  creator_id?: string | null;
  first_touch_timestamp?: string;
  last_touch_timestamp?: string;
}

class SnackQuestTracker {
  private apiUrl: string = '';
  private landingPageId: string = 'lp_default';
  private environment: string = 'production';
  private debug: boolean = false;
  private isInitialized: boolean = false;

  private sessionId: string = '';
  private visitorId: string = '';
  private firstVisitTimestamp: string = '';

  private attribution: AttributionData = {};
  private visitorProfile: VisitorProfile | null = null;

  private eventQueue: any[] = [];
  private retryDelayMs: number = 1000;
  private retryTimer: any = null;

  private pageStartTime: number = Date.now();
  private trackedScrollDepths: Set<number> = new Set();
  private sectionObserver: IntersectionObserver | null = null;

  constructor() {
    // Self-bind methods
    this.init = this.init.bind(this);
    this.track = this.track.bind(this);
    this.getWhatsAppUrl = this.getWhatsAppUrl.bind(this);
  }

  /**
   * Initialize the SDK
   */
  public init(options: SnackQuestInitOptions): void {
    try {
      if (this.isInitialized) return;

      this.apiUrl = (options.apiUrl || '').replace(/\/$/, '');
      this.landingPageId = options.landingPageId || 'lp_default';
      this.environment = options.environment || 'production';
      this.debug = !!options.debug;

      this.setupSessionAndVisitor();
      this.setupAttribution();
      this.visitorProfile = this.collectVisitorProfile();

      this.loadQueueFromStorage();
      this.setupNetworkListeners();

      // Register session with backend
      this.registerSessionBackend();

      if (options.autoTrack !== false) {
        this.setupAutomaticTracking();
      }

      this.isInitialized = true;
      this.log('SnackQuest Tracker SDK initialized successfully.', {
        sessionId: this.sessionId,
        visitorId: this.visitorId,
        landingPageId: this.landingPageId
      });
    } catch (e) {
      console.warn('SnackQuest Tracker init safe error:', e);
    }
  }

  /**
   * Session & Visitor Identifier Persistence (localStorage, sessionStorage, cookie)
   */
  private setupSessionAndVisitor(): void {
    const now = new Date().toISOString();

    // Visitor ID (permanent)
    let vid = this.getStorageItem('sq_visitor_id') || this.getCookie('sq_visitor_id');
    if (!vid) {
      vid = `vis_${this.generateUuid()}`;
      this.setStorageItem('sq_visitor_id', vid);
      this.setCookie('sq_visitor_id', vid, 365);
    }
    this.visitorId = vid;

    // First visit timestamp
    let firstVisit = this.getStorageItem('sq_first_visit');
    if (!firstVisit) {
      firstVisit = now;
      this.setStorageItem('sq_first_visit', firstVisit);
    }
    this.firstVisitTimestamp = firstVisit;

    // Session ID (per session)
    let sid = sessionStorage.getItem('sq_session_id') || this.getCookie('sq_session_id');
    const isNewSession = !sid;
    if (!sid) {
      sid = `sess_${this.generateUuid()}`;
      sessionStorage.setItem('sq_session_id', sid);
      this.setCookie('sq_session_id', sid, 1);
    }
    this.sessionId = sid;

    // Track Session Start if new
    if (isNewSession) {
      const isFirst = !this.getStorageItem('sq_has_visited_before');
      this.setStorageItem('sq_has_visited_before', 'true');

      this.trackInternal(isFirst ? 'FirstVisit' : 'ReturningVisit', {
        event_name: isFirst ? 'FirstVisit' : 'ReturningVisit'
      });
      this.trackInternal('SessionStart', { event_name: 'SessionStart' });
    }
  }

  /**
   * Universal Marketing & Creator Attribution Parser
   */
  private setupAttribution(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const now = new Date().toISOString();

    const currentAttr: AttributionData = {
      fbclid: urlParams.get('fbclid'),
      gclid: urlParams.get('gclid'),
      ttclid: urlParams.get('ttclid'),
      msclkid: urlParams.get('msclkid'),
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_content: urlParams.get('utm_content'),
      utm_term: urlParams.get('utm_term'),
      ref_code: urlParams.get('ref') || urlParams.get('referral_code'),
      creator_id: urlParams.get('creator') || urlParams.get('creator_id'),
      referrer: document.referrer || 'Direct',
      landing_page_id: this.landingPageId
    };

    // First Touch Attribution (never overwrite)
    let firstTouch = this.getStorageObject<AttributionData>('sq_first_touch');
    if (!firstTouch || Object.keys(firstTouch).length === 0) {
      firstTouch = { ...currentAttr, first_touch_timestamp: now };
      this.setStorageObject('sq_first_touch', firstTouch);
    }

    // Last Touch Attribution (update when new params arrive)
    let lastTouch = this.getStorageObject<AttributionData>('sq_last_touch');
    const hasNewCampaign =
      currentAttr.fbclid ||
      currentAttr.gclid ||
      currentAttr.ttclid ||
      currentAttr.utm_source ||
      currentAttr.ref_code;

    if (hasNewCampaign || !lastTouch) {
      lastTouch = { ...currentAttr, last_touch_timestamp: now };
      this.setStorageObject('sq_last_touch', lastTouch);
    }

    // Persist active referral code / creator ID
    if (currentAttr.ref_code) {
      this.setStorageItem('sq_ref_code', currentAttr.ref_code);
    }
    if (currentAttr.creator_id) {
      this.setStorageItem('sq_creator_id', currentAttr.creator_id);
    }

    this.attribution = {
      ...firstTouch,
      ...lastTouch,
      ref_code: this.getStorageItem('sq_ref_code') || currentAttr.ref_code,
      creator_id: this.getStorageItem('sq_creator_id') || currentAttr.creator_id
    };
  }

  /**
   * Collect Visitor Technical Profile
   */
  private collectVisitorProfile(): VisitorProfile {
    const ua = navigator.userAgent;
    let browser = 'Other';
    if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung Internet';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
    else if (ua.indexOf('Trident') > -1) browser = 'Internet Explorer';
    else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) browser = 'Edge';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';

    let os = 'Unknown OS';
    if (ua.indexOf('Win') !== -1) os = 'Windows';
    else if (ua.indexOf('Mac') !== -1) os = 'macOS';
    else if (ua.indexOf('Linux') !== -1) os = 'Linux';
    else if (ua.indexOf('Android') !== -1) os = 'Android';
    else if (ua.indexOf('like Mac') !== -1) os = 'iOS';

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    const device_type = isMobile ? 'Mobile' : 'Desktop';

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const connection_type = connection ? connection.effectiveType || connection.type || 'unknown' : 'unknown';

    const dark_mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const pwa_installed = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

    return {
      visitor_id: this.visitorId,
      session_id: this.sessionId,
      browser,
      os,
      device_type,
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi',
      language: navigator.language || 'en-US',
      connection_type,
      dark_mode,
      pwa_installed,
      user_agent: ua
    };
  }

  /**
   * Backend Session Registration
   */
  private registerSessionBackend(): void {
    const payload = {
      session_id: this.sessionId,
      visitor_id: this.visitorId,
      landing_page_id: this.landingPageId,
      first_visit_timestamp: this.firstVisitTimestamp,
      environment: this.environment,
      profile: this.visitorProfile,
      attribution: this.attribution,
      page_url: window.location.href,
      referrer: document.referrer || 'Direct'
    };

    this.sendHttpRequest('/api/v1/sessions', payload).catch(() => {
      this.queueEvent({ endpoint: '/api/v1/sessions', payload });
    });
  }

  /**
   * Track Custom Event (Public API)
   */
  public track(options: TrackEventOptions): void {
    try {
      this.trackInternal(options.event, {
        event_name: options.event,
        value_kes: options.value,
        currency: options.currency || 'KES',
        metadata: options.metadata || {},
        event_id: options.eventId
      });
    } catch (e) {
      this.log('Safe error in track():', e);
    }
  }

  /**
   * Internal Event Dispatcher with Browser Platform Hooks & Queueing
   */
  private trackInternal(eventName: string, extraData: Record<string, any> = {}): void {
    const eventId = extraData.event_id || `evt_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const eventRecord = {
      event_id: eventId,
      event_name: eventName,
      session_id: this.sessionId,
      visitor_id: this.visitorId,
      landing_page_id: this.landingPageId,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      referrer: document.referrer || 'Direct',
      value_kes: extraData.value_kes || 0,
      metadata: extraData.metadata || {},
      device_type: this.visitorProfile?.device_type || 'Mobile',
      browser: this.visitorProfile?.browser || 'Chrome',
      os: this.visitorProfile?.os || 'Android',
      screen_size: this.visitorProfile?.screen_resolution || '390x844',
      attribution_params: this.attribution
    };

    // Dispatch to Meta Pixel if present in host window
    this.dispatchMetaPixel(eventName, eventRecord, eventId);

    // Dispatch to GA4 if present
    this.dispatchGA4(eventName, eventRecord);

    // Send to Backend API
    this.sendHttpRequest('/api/v1/marketing/events', eventRecord)
      .catch(() => {
        this.queueEvent({ endpoint: '/api/v1/marketing/events', payload: eventRecord });
      });
  }

  /**
   * Generate Custom Smart WhatsApp URL with Full Attribution State
   */
  public getWhatsAppUrl(phone: string = '254700000000', baseText: string = 'Hi Snack Quest!'): string {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const refCode = this.attribution.ref_code || 'DIRECT';
    const creatorId = this.attribution.creator_id || 'none';
    const source = this.attribution.utm_source || 'landing_page';
    const campaign = this.attribution.utm_campaign || 'general';

    const handoffMeta = `Ref=${refCode}|SID=${this.sessionId}|LP=${this.landingPageId}|Src=${source}|Camp=${campaign}|Cre=${creatorId}`;
    const text = `${baseText} (${handoffMeta})`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Automatic Event Observers (Pageviews, Scroll Depth, Heatmaps, Sections, Forms, Exit Intent, WhatsApp)
   */
  private setupAutomaticTracking(): void {
    // 1. PageView
    this.trackInternal('PageView', { event_name: 'PageView' });

    // 2. Scroll Depth Observers (25%, 50%, 75%, 90%)
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const pct = Math.floor((scrollTop / docHeight) * 100);
      [25, 50, 75, 90].forEach((targetPct) => {
        if (pct >= targetPct && !this.trackedScrollDepths.has(targetPct)) {
          this.trackedScrollDepths.add(targetPct);
          this.trackInternal('ScrollDepth', {
            event_name: 'ScrollDepth',
            metadata: { scroll_percent: targetPct }
          });
        }
      });
    }, { passive: true });

    // 3. Section Visibility Observers (IntersectionObserver)
    if ('IntersectionObserver' in window) {
      this.sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              const sectionName = el.getAttribute('data-sq-section') || el.id || el.className;
              this.trackInternal('SectionViewed', {
                event_name: 'SectionViewed',
                metadata: { section_id: sectionName }
              });
              this.sectionObserver?.unobserve(el);
            }
          });
        },
        { threshold: 0.3 }
      );

      // Attach observers to relevant sections
      const sections = document.querySelectorAll('[data-sq-section], #hero, #founder-story, #faq, #gallery, #testimonials, #video, #pricing');
      sections.forEach((sec) => this.sectionObserver?.observe(sec));
    }

    // 4. Click Heatmap & Interaction Observers
    document.addEventListener('click', (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement;
        if (!target) return;

        const isButton = target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'button';
        const isWhatsApp = target.closest('a[href*="wa.me"]') || target.closest('a[href*="whatsapp.com"]') || target.closest('[data-sq-whatsapp]');

        // Click coordinates for Heatmap Engine
        const clickCoord = {
          x: e.clientX,
          y: e.clientY + window.scrollY,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          target_tag: target.tagName,
          target_text: (target.innerText || '').slice(0, 40),
          target_id: target.id || '',
          target_class: target.className || ''
        };

        if (isWhatsApp) {
          const waLink = target.closest('a') as HTMLAnchorElement;
          if (waLink && !waLink.href.includes('Ref=')) {
            const rawPhone = waLink.href.match(/wa\.me\/([0-9]+)/)?.[1] || '254700000000';
            waLink.href = this.getWhatsAppUrl(rawPhone, 'Hi Snack Quest!');
          }

          this.trackInternal('WhatsAppClick', {
            event_name: 'WhatsAppClick',
            metadata: { click_coordinate: clickCoord }
          });
        } else if (isButton) {
          this.trackInternal('ButtonClicks', {
            event_name: 'ButtonClicks',
            metadata: { click_coordinate: clickCoord, label: (target.innerText || 'Button').slice(0, 50) }
          });
        }
      } catch (err) {
        // Safe click observer fail
      }
    }, { capture: true });

    // 5. Exit Intent Observer
    document.addEventListener('mouseleave', (e: MouseEvent) => {
      if (e.clientY <= 10) {
        this.trackInternal('ExitIntent', { event_name: 'ExitIntent' });
      }
    });

    // 6. Form Engagement
    document.addEventListener('focusin', (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        this.trackInternal('FormStarted', { event_name: 'FormStarted', metadata: { field_name: target.getAttribute('name') || target.id } });
      }
    }, { once: true });

    // 7. Time On Page & Session End
    window.addEventListener('beforeunload', () => {
      const timeOnPageSec = Math.round((Date.now() - this.pageStartTime) / 1000);
      const endPayload = {
        session_id: this.sessionId,
        visitor_id: this.visitorId,
        landing_page_id: this.landingPageId,
        time_on_page_seconds: timeOnPageSec,
        scroll_depth_max: Math.max(0, ...Array.from(this.trackedScrollDepths))
      };

      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${this.apiUrl}/api/v1/marketing/session/end`, JSON.stringify(endPayload));
      }
    });
  }

  /**
   * Browser Platform Meta Pixel Dispatcher
   */
  private dispatchMetaPixel(eventName: string, eventRecord: any, eventId: string): void {
    try {
      if ((window as any).fbq) {
        const pixelEventMap: Record<string, string> = {
          PageView: 'PageView',
          WhatsAppClick: 'Contact',
          FormCompleted: 'Lead',
          BoxSelected: 'ViewContent'
        };
        const mappedName = pixelEventMap[eventName] || 'CustomEvent';
        (window as any).fbq('track', mappedName, {
          value: eventRecord.value_kes,
          currency: 'KES',
          content_name: this.landingPageId
        }, { eventID: eventId });
      }
    } catch (e) {
      // Ignore client pixel error
    }
  }

  /**
   * Browser Platform GA4 Dispatcher
   */
  private dispatchGA4(eventName: string, eventRecord: any): void {
    try {
      if ((window as any).gtag) {
        (window as any).gtag('event', eventName, {
          event_category: 'LandingPage',
          event_label: this.landingPageId,
          value: eventRecord.value_kes
        });
      }
    } catch (e) {
      // Ignore client gtag error
    }
  }

  /**
   * Offline Event Queue & Exponential Retry Mechanism
   */
  private queueEvent(item: { endpoint: string; payload: any }): void {
    this.eventQueue.push({ ...item, timestamp: Date.now() });
    if (this.eventQueue.length > 200) {
      this.eventQueue = this.eventQueue.slice(-200);
    }
    this.saveQueueToStorage();
    this.scheduleRetry();
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.log('Network reconnected. Flushing offline event queue...');
      this.retryDelayMs = 1000;
      this.flushQueue();
    });
  }

  private flushQueue(): void {
    if (this.eventQueue.length === 0 || !navigator.onLine) return;

    const itemsToSend = [...this.eventQueue];
    this.eventQueue = [];
    this.saveQueueToStorage();

    // Batch send if multiple events
    if (itemsToSend.length > 1) {
      const batchPayload = itemsToSend.map((i) => i.payload);
      this.sendHttpRequest('/api/v1/marketing/batch', { events: batchPayload })
        .then(() => {
          this.log(`Flushed batch of ${batchPayload.length} offline events successfully.`);
          this.retryDelayMs = 1000;
        })
        .catch(() => {
          this.eventQueue = [...itemsToSend, ...this.eventQueue];
          this.saveQueueToStorage();
          this.scheduleRetry();
        });
    } else if (itemsToSend.length === 1) {
      const single = itemsToSend[0];
      this.sendHttpRequest(single.endpoint, single.payload)
        .then(() => {
          this.log('Flushed single offline event.');
          this.retryDelayMs = 1000;
        })
        .catch(() => {
          this.eventQueue.push(single);
          this.saveQueueToStorage();
          this.scheduleRetry();
        });
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, 60000); // Max 60s
      this.flushQueue();
    }, this.retryDelayMs);
  }

  private loadQueueFromStorage(): void {
    try {
      const stored = localStorage.getItem('sq_event_queue');
      if (stored) {
        this.eventQueue = JSON.parse(stored);
      }
    } catch (e) {
      this.eventQueue = [];
    }
  }

  private saveQueueToStorage(): void {
    try {
      localStorage.setItem('sq_event_queue', JSON.stringify(this.eventQueue));
    } catch (e) {
      // Storage quota exceeded
    }
  }

  /**
   * Universal HTTP Request Wrapper
   */
  private async sendHttpRequest(endpoint: string, data: any): Promise<any> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Cookie & Storage Utilities
   */
  private getStorageItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  private setStorageItem(key: string, val: string): void {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      // Safe storage
    }
  }

  private getStorageObject<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  private setStorageObject(key: string, val: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      // Safe storage
    }
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  }

  private setCookie(name: string, val: string, days: number): void {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${val};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[SnackQuest Tracker]', ...args);
    }
  }
}

// Instantiate Singleton Instance
const trackerInstance = new SnackQuestTracker();

// Expose on global window object for script tag embeds
if (typeof window !== 'undefined') {
  (window as any).SnackQuestTracker = trackerInstance;
}

export default trackerInstance;
