/**
 * Domain & Subdomain Resolution Library for Snack Quest Multi-Portal Architecture
 * 
 * Target Subdomains:
 * - www.snackquest.shop -> 'public' (Public Website)
 * - quest.snackquest.shop -> 'quest' (Customer Quest Center)
 * - creators.snackquest.shop -> 'creators' (Creator Portal)
 * - admin.snackquest.shop -> 'admin' (Admin Operating System)
 * - api.snackquest.shop -> 'api' (API Gateway & Spec)
 */

export type PortalType = 'public' | 'quest' | 'creators' | 'admin' | 'api';

export interface PortalInfo {
  type: PortalType;
  title: string;
  subdomain: string;
  expectedHost: string;
  isOverride: boolean;
  detectedHostname: string;
}

export const PORTAL_METADATA: Record<PortalType, { title: string; subdomain: string; description: string }> = {
  public: {
    title: 'Snack Quest Public Website',
    subdomain: 'www.snackquest.shop',
    description: 'Product catalog, creator recruitment, brand story, and direct box orders.'
  },
  quest: {
    title: 'Customer Quest Center',
    subdomain: 'quest.snackquest.shop',
    description: 'Consumer loyalty app, active quests, order tracking, and reward wallet.'
  },
  creators: {
    title: 'Creator Portal',
    subdomain: 'creators.snackquest.shop',
    description: 'Dedicated YouTube Studio-style affiliate & creator management dashboard.'
  },
  admin: {
    title: 'Admin Operating System',
    subdomain: 'admin.snackquest.shop',
    description: 'Enterprise staff control room for orders, inventory, finance, and moderation.'
  },
  api: {
    title: 'Snack Quest API Gateway',
    subdomain: 'api.snackquest.shop',
    description: 'REST API endpoints documentation, webhooks, and system health status.'
  }
};

/**
 * Detect active portal based on window.location.hostname and URL overrides
 */
export function resolvePortal(): PortalInfo {
  if (typeof window === 'undefined') {
    return {
      type: 'public',
      title: PORTAL_METADATA.public.title,
      subdomain: PORTAL_METADATA.public.subdomain,
      expectedHost: 'www.snackquest.shop',
      isOverride: false,
      detectedHostname: 'localhost'
    };
  }

  const hostname = window.location.hostname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const portalParam = searchParams.get('portal') || searchParams.get('subdomain');

  // Check query parameter override first (useful for dev / preview iframe testing)
  if (portalParam) {
    const normalizedParam = portalParam.toLowerCase();
    let overrideType: PortalType = 'public';
    if (['quest', 'customer'].includes(normalizedParam)) overrideType = 'quest';
    else if (['creator', 'creators', 'affiliate'].includes(normalizedParam)) overrideType = 'creators';
    else if (['admin', 'staff', 'os'].includes(normalizedParam)) overrideType = 'admin';
    else if (['api', 'gateway'].includes(normalizedParam)) overrideType = 'api';
    else overrideType = 'public';

    localStorage.setItem('sq_portal_override', overrideType);

    return {
      type: overrideType,
      title: PORTAL_METADATA[overrideType].title,
      subdomain: PORTAL_METADATA[overrideType].subdomain,
      expectedHost: PORTAL_METADATA[overrideType].subdomain,
      isOverride: true,
      detectedHostname: hostname
    };
  }

  // Check stored override if in dev / preview environment
  const isDevEnv = hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes('run.app');
  const storedOverride = localStorage.getItem('sq_portal_override') as PortalType | null;

  if (isDevEnv && storedOverride && PORTAL_METADATA[storedOverride]) {
    return {
      type: storedOverride,
      title: PORTAL_METADATA[storedOverride].title,
      subdomain: PORTAL_METADATA[storedOverride].subdomain,
      expectedHost: PORTAL_METADATA[storedOverride].subdomain,
      isOverride: true,
      detectedHostname: hostname
    };
  }

  // Hostname matching logic for real subdomains
  let detectedType: PortalType = 'public';

  if (hostname.startsWith('admin.') || hostname === 'admin.snackquest.shop') {
    detectedType = 'admin';
  } else if (
    hostname.startsWith('creators.') ||
    hostname.startsWith('creator.') ||
    hostname === 'creators.snackquest.shop'
  ) {
    detectedType = 'creators';
  } else if (hostname.startsWith('quest.') || hostname === 'quest.snackquest.shop') {
    detectedType = 'quest';
  } else if (hostname.startsWith('api.') || hostname === 'api.snackquest.shop') {
    detectedType = 'api';
  } else {
    detectedType = 'public';
  }

  return {
    type: detectedType,
    title: PORTAL_METADATA[detectedType].title,
    subdomain: PORTAL_METADATA[detectedType].subdomain,
    expectedHost: PORTAL_METADATA[detectedType].subdomain,
    isOverride: false,
    detectedHostname: hostname
  };
}

/**
 * Switch portal explicitly (persists in localStorage for dev environments)
 */
export function setDevPortalOverride(portal: PortalType) {
  localStorage.setItem('sq_portal_override', portal);
  const url = new URL(window.location.href);
  url.searchParams.set('portal', portal);
  window.location.href = url.toString();
}

/**
 * Clear dev portal override
 */
export function clearDevPortalOverride() {
  localStorage.removeItem('sq_portal_override');
  const url = new URL(window.location.href);
  url.searchParams.delete('portal');
  url.searchParams.delete('subdomain');
  window.location.href = url.toString();
}
