/**
 * Centralized API Client for Snack Quest Multi-Subdomain Production Architecture
 */

import { resolvePortal } from './domainResolver';

/**
 * Returns base API URL based on current environment and domain configuration.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const hostname = window.location.hostname;
  
  // Production subdomain setup
  if (hostname.endsWith('snackquest.shop') && !hostname.includes('localhost')) {
    return 'https://api.snackquest.shop';
  }

  // Development or Cloud Run preview fallback (same-origin relative path)
  return '';
}

/**
 * Perform authenticated API Request with standardized error handling and multi-subdomain cookie credentials
 */
export async function apiClient<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${normalizedEndpoint}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-SnackQuest-Portal': resolvePortal().type,
    ...(options.headers as Record<string, string> || {})
  };

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: defaultHeaders,
      credentials: 'include' // Enforce cross-subdomain cookie credentials
    });

    const contentType = response.headers.get('content-type');
    let data: any = null;

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = await response.text().catch(() => null);
      }
    } else {
      data = await response.text().catch(() => null);
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: (data && data.error) ? data.error : `HTTP ${response.status}: ${response.statusText}`,
        data
      };
    }

    return {
      ok: true,
      status: response.status,
      data
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err.message || 'Network request failed'
    };
  }
}
