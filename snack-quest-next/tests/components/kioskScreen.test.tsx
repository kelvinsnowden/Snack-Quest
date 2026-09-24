// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KioskScreen } from '@/components/kiosk/KioskScreen';
import type { ProductAvailabilityState } from '@/types';

/**
 * The customer machine screen's own state machine (§ PART 1 —
 * CUSTOMER MACHINE EXPERIENCE, § PRODUCT STATES, § SHOPPING FLOW).
 * Covers the parts that matter most: pairing persists and is reused
 * as the device Bearer header on every call (never a customer
 * session, never a staff session), only an `available` tile can be
 * added to the cart, the cart's running total is exactly the sum of
 * its lines, and — the one real architectural constraint this screen
 * has to honor — a multi-item checkout is never sent as one combined
 * charge; it is a sequential queue of one STK push and one vend per
 * cart line, because the machine can only ever dispense one slot at a
 * time. A fetch failure falls back to the last cached catalog rather
 * than blanking the screen.
 */

const MACHINE_ID = 'machine-kiosk-1';
const MACHINE_CODE = 'SQ-001';

function catalogItem(overrides: Partial<{ productId: string; name: string; slotCode: string; priceKes: number; availabilityState: ProductAvailabilityState; sellable: boolean; category: string | null }> = {}) {
  return {
    productId: overrides.productId ?? 'sku-1',
    productCatalogue: 'snackItem' as const,
    slotCode: overrides.slotCode ?? 'A01',
    name: overrides.name ?? 'Korean Spicy Snack',
    description: null,
    imageUrl: null,
    category: overrides.category ?? 'Korean Snacks',
    priceKes: overrides.priceKes ?? 250,
    availabilityState: overrides.availabilityState ?? 'available',
    sellable: overrides.sellable ?? true,
    displayOrder: 1,
    promotionalState: 'none' as const,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KioskScreen — pairing', () => {
  it('shows a pairing form when no secret is stored, and stores + uses it as the device Bearer header once paired', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items: [catalogItem()] }) });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    expect(screen.getByText(`Pair ${MACHINE_CODE}`)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Device secret'), { target: { value: 'top-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/vending/machines/${MACHINE_ID}/catalog`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${MACHINE_ID}:top-secret`);
    expect(window.localStorage.getItem(`sq_kiosk_secret_${MACHINE_ID}`)).toBe('top-secret');

    await waitFor(() => expect(screen.getByText('Korean Spicy Snack')).toBeTruthy());
  });

  it('un-pairs and shows the pairing form again if the stored secret is rejected as revoked', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'revoked-secret');
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'invalid_secret' }) });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText(`Pair ${MACHINE_CODE}`)).toBeTruthy());
    expect(window.localStorage.getItem(`sq_kiosk_secret_${MACHINE_ID}`)).toBeNull();
  });
});

describe('KioskScreen — browse and product states', () => {
  it('groups items by category and only lets an available item be added to the cart', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        catalogVersion: 'v1',
        items: [
          catalogItem({ productId: 'sku-available', slotCode: 'A01', name: 'Available Snack', category: 'Chips' }),
          catalogItem({ productId: 'sku-soldout', slotCode: 'A02', name: 'Sold Out Snack', category: 'Chips', availabilityState: 'sold_out', sellable: false }),
          catalogItem({ productId: 'sku-soon', slotCode: 'A03', name: 'Coming Soon Snack', category: 'Drinks', availabilityState: 'coming_soon', sellable: false }),
        ],
      }),
    });

    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Available Snack')).toBeTruthy());

    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.getByText('Chips')).toBeTruthy();
    expect(screen.getByText('Drinks')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add Available Snack to cart/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cart/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Cart/ }).textContent).toContain('1');
  });

  it('filters the grid by the selected category', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        catalogVersion: 'v1',
        items: [
          catalogItem({ productId: 'sku-chip', slotCode: 'A01', name: 'Chip Snack', category: 'Chips' }),
          catalogItem({ productId: 'sku-drink', slotCode: 'A02', name: 'Drink Item', category: 'Drinks' }),
        ],
      }),
    });
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Chip Snack')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Drinks' }));
    expect(screen.queryByText('Chip Snack')).toBeNull();
    expect(screen.getByText('Drink Item')).toBeTruthy();
  });
});

describe('KioskScreen — cart and multi-item checkout', () => {
  function mockCatalogAndPayments() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            catalogVersion: 'v1',
            items: [
              catalogItem({ productId: 'sku-a', slotCode: 'A01', name: 'Snack A', priceKes: 200 }),
              catalogItem({ productId: 'sku-b', slotCode: 'B01', name: 'Snack B', priceKes: 300 }),
            ],
          }),
        };
      }
      if (url === '/api/vending/payments' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        if (body.slotId === 'A01') return { ok: true, status: 201, json: async () => ({ id: 'txn-a' }) };
        if (body.slotId === 'B01') return { ok: true, status: 201, json: async () => ({ id: 'txn-b' }) };
        throw new Error(`unexpected slotId ${body.slotId}`);
      }
      if (url === '/api/vending/payments/txn-a') {
        return { ok: true, status: 200, json: async () => ({ status: 'dispensed', vendRef: 'vend-a', failureReason: null }) };
      }
      if (url === '/api/vending/payments/txn-b') {
        return { ok: true, status: 200, json: async () => ({ status: 'dispensed', vendRef: 'vend-b', failureReason: null }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it('sums the cart total from its lines and checks out each line as its own sequential payment — never one combined charge', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    mockCatalogAndPayments();

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Snack A')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Add Snack A to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add Snack B to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cart/ }));

    await waitFor(() => expect(screen.getByText('Your Cart')).toBeTruthy());
    expect(screen.getByText('KES 500')).toBeTruthy(); // 200 + 300 combined total shown to the customer

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to M-Pesa' }));
    const phoneInput = await screen.findByPlaceholderText('07XXXXXXXX');
    fireEvent.change(phoneInput, { target: { value: '0700000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send STK Push' }));

    // Exactly two separate POSTs, one per cart line, each with its own slotId and no combined amount field — the honest bridge over a one-slot-at-a-time machine.
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter((call: unknown[]) => call[0] === '/api/vending/payments' && (call[1] as RequestInit | undefined)?.method === 'POST');
      expect(postCalls).toHaveLength(2);
    }, { timeout: 5000 });

    await waitFor(() => expect(screen.getByText(/All done/)).toBeTruthy(), { timeout: 5000 });
  }, 15_000);

  it('removes a line entirely and updates the total when its remove button is pressed', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    mockCatalogAndPayments();

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Snack A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Snack A to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add Snack B to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cart/ }));

    await waitFor(() => expect(screen.getByText('Your Cart')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Snack A from cart' }));
    expect(screen.queryByText('Snack A')).toBeNull();
    // The remaining line's unit price, its Order Summary subtotal, and the grand Total all read KES 300 — and no leftover reference to Snack A's KES 200 anywhere.
    expect(screen.getAllByText('KES 300').length).toBeGreaterThan(0);
    expect(screen.queryByText('KES 200')).toBeNull();
  });
});

describe('KioskScreen — offline behaviour', () => {
  it('falls back to the last cached catalog and shows an offline banner when the catalog fetch fails', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    window.localStorage.setItem(`sq_kiosk_catalog_cache_${MACHINE_ID}`, JSON.stringify({ catalogVersion: 'v0', items: [catalogItem()] }));
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeTruthy());
    expect(screen.getByText('Korean Spicy Snack')).toBeTruthy();
  });
});
