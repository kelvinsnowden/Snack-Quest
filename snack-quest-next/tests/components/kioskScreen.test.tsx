// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 * has to honor — a multi-item checkout is still exactly one STK push
 * for the whole cart (`slotIds`, not a `slotId`-per-request queue),
 * because a customer should never have to approve three separate
 * M-Pesa prompts for three items; the machine still authorizes each
 * item's own vend once that one payment clears, and this screen polls
 * every transaction id it gets back until each has its own outcome. A
 * fetch failure falls back to the last cached catalog rather than
 * blanking the screen. Staff-chosen artwork appears where it was
 * placed, and an order left behind is cleared when the screen goes idle.
 */

const MACHINE_ID = 'machine-kiosk-1';
const MACHINE_CODE = 'SQ-001';

function catalogItem(
  overrides: Partial<{ productId: string; name: string; slotCode: string; priceKes: number; availabilityState: ProductAvailabilityState; sellable: boolean; category: string | null; description: string | null; origin: string | null }> = {},
) {
  return {
    productId: overrides.productId ?? 'sku-1',
    productCatalogue: 'snackItem' as const,
    slotCode: overrides.slotCode ?? 'A01',
    name: overrides.name ?? 'Korean Spicy Snack',
    description: overrides.description ?? null,
    imageUrl: null,
    origin: overrides.origin ?? null,
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

    // Only the available product offers an add button at all.
    expect(screen.queryByRole('button', { name: /Add Sold Out Snack to cart/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Coming Soon Snack to cart/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add Available Snack to cart/ }));
    const order = screen.getByRole('region', { name: 'Your order' });
    await waitFor(() => expect(within(order).getByText('Available Snack')).toBeTruthy());
    expect(within(order).getByText('1 item')).toBeTruthy();
    // The line's subtotal and the order total.
    expect(within(order).getAllByText('KES 250')).toHaveLength(2);
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
        const body = JSON.parse(init.body as string) as { slotIds: string[] };
        expect(body.slotIds).toEqual(['A01', 'B01']); // exactly one POST for the whole cart — never one request per item
        return {
          ok: true,
          status: 201,
          json: async () => ({
            checkoutRequestId: 'ws_CO_cart',
            merchantRequestId: 'mr_cart',
            customerMessage: 'Enter your PIN',
            cartRef: 'CART-TEST',
            transactions: [
              { id: 'txn-a', transactionRef: 'TXN-A', slotId: 'A01', amountKes: 200 },
              { id: 'txn-b', transactionRef: 'TXN-B', slotId: 'B01', amountKes: 300 },
            ],
          }),
        };
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

  it('sums the cart total from its lines and pays for the whole cart with exactly one STK push', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    mockCatalogAndPayments();

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Snack A')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Add Snack A to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add Snack B to cart/ }));

    const order = screen.getByRole('region', { name: 'Your order' });
    await waitFor(() => expect(within(order).getByText('KES 500')).toBeTruthy()); // 200 + 300 combined total shown to the customer

    fireEvent.click(within(order).getByRole('button', { name: /^Pay/ }));
    const phoneInput = await screen.findByPlaceholderText('07XXXXXXXX');
    expect(screen.getByText('KES 500')).toBeTruthy();
    // The pay button stays off until the number is complete.
    fireEvent.change(phoneInput, { target: { value: '07000' } });
    expect((screen.getByRole('button', { name: 'Send payment request' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(phoneInput, { target: { value: '0700000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send payment request' }));

    // Exactly one POST for the whole cart — the mock's own assertion on `slotIds` above is what actually proves the shape; this proves it was only called once.
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter((call: unknown[]) => call[0] === '/api/vending/payments' && (call[1] as RequestInit | undefined)?.method === 'POST');
      expect(postCalls).toHaveLength(1);
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

    const order = screen.getByRole('region', { name: 'Your order' });
    await waitFor(() => expect(within(order).getByText('Snack A')).toBeTruthy());
    fireEvent.click(within(order).getByRole('button', { name: 'Remove Snack A from cart' }));
    expect(within(order).queryByText('Snack A')).toBeNull();
    // The remaining line's subtotal and the order total both read KES 300 — and no leftover reference to Snack A's KES 200 anywhere in the order.
    expect(within(order).getAllByText('KES 300')).toHaveLength(2);
    expect(within(order).queryByText('KES 200')).toBeNull();
  });

  it('builds the number from the on-screen keypad and sends exactly those digits', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    mockCatalogAndPayments();

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Snack A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Snack A to cart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add Snack B to cart/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Your order' })).getByRole('button', { name: /^Pay/ }));

    const keypad = await screen.findByRole('group', { name: 'Number pad' });
    for (const digit of '07123456789') fireEvent.click(within(keypad).getByRole('button', { name: digit }));
    fireEvent.click(within(keypad).getByRole('button', { name: 'Delete last digit' }));
    expect((screen.getByLabelText('M-Pesa number') as HTMLInputElement).value).toBe('0712 345 678');

    fireEvent.click(screen.getByRole('button', { name: 'Send payment request' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call: unknown[]) => call[0] === '/api/vending/payments');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string).phoneNumber).toBe('0712345678');
    });
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

describe('KioskScreen — product sheet', () => {
  it('shows the description and origin, and adds the chosen quantity to the order', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ catalogVersion: 'v1', items: [catalogItem({ name: 'Honey Butter Chips', origin: 'Korea', description: 'Sweet, buttery and salty all at once.' })] }),
    });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Honey Butter Chips')).toBeTruthy());
    fireEvent.click(screen.getByRole('heading', { name: 'Honey Butter Chips' }));

    const sheet = await screen.findByRole('dialog', { name: 'Honey Butter Chips' });
    expect(within(sheet).getByText('Sweet, buttery and salty all at once.')).toBeTruthy();
    expect(within(sheet).getByText('From Korea')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add one more Honey Butter Chips' }));
    fireEvent.click(within(sheet).getByRole('button', { name: /Add to order · KES 500/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    const order = screen.getByRole('region', { name: 'Your order' });
    expect(within(order).getByText('2 items')).toBeTruthy();
    expect(within(order).getAllByText('KES 500').length).toBeGreaterThan(0);
  });
});

describe('KioskScreen — staff-chosen artwork', () => {
  it('shows the menu banner images staff chose, fetched with the device credential', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items: [catalogItem()] }) };
      if (url.endsWith('/content')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            screen: {
              menu_banner: [
                { imageUrl: 'https://blob.example/banner.webp', altText: 'New: honey butter chips' },
                // Never rendered: not an https or site-relative address.
                { imageUrl: 'javascript:alert(1)', altText: 'bad' },
              ],
              attract: [],
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    const banner = await screen.findByAltText('New: honey butter chips');
    expect(banner.getAttribute('src')).toBe('https://blob.example/banner.webp');
    expect(screen.queryByAltText('bad')).toBeNull();
    const screenCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).endsWith('/content')) as [string, RequestInit];
    expect(screenCall[0]).toBe(`/api/vending/machines/${MACHINE_ID}/content`);
    expect((screenCall[1].headers as Record<string, string>).Authorization).toBe(`Bearer ${MACHINE_ID}:secret`);
  });

  it('draws the built-in banner, naming where the snacks come from, when staff chose none', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items: [catalogItem({ origin: 'Japan' }), catalogItem({ productId: 'sku-2', slotCode: 'A02', name: 'Other', origin: 'Korea' })] }) });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await waitFor(() => expect(screen.getByText('Taste the world')).toBeTruthy());
    expect(screen.getByText(/Snacks from Japan, Korea\./)).toBeTruthy();
  });
});

describe('KioskScreen — idle', () => {
  it('clears an abandoned order and shows the idle screen; a tap opens a fresh menu', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items: [catalogItem()] }) };
      if (url.endsWith('/content')) return { ok: true, status: 200, json: async () => ({ screen: { menu_banner: [], attract: [{ imageUrl: 'https://blob.example/idle.webp', altText: 'Snacks from 12 countries' }] } }) };
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} idleTimeoutMs={200} />);
    await waitFor(() => expect(screen.getByText('Korean Spicy Snack')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Korean Spicy Snack to cart/ }));
    expect(within(screen.getByRole('region', { name: 'Your order' })).getByText('1 item')).toBeTruthy();

    const start = await screen.findByRole('button', { name: 'Tap to start your order' }, { timeout: 3000 });
    expect(screen.getByAltText('Snacks from 12 countries')).toBeTruthy();
    fireEvent.click(start);

    await waitFor(() => expect(screen.getByText('Korean Spicy Snack')).toBeTruthy());
    expect(within(screen.getByRole('region', { name: 'Your order' })).queryByText('1 item')).toBeNull();
  });

  it('never goes idle while a payment is in flight', async () => {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items: [catalogItem()] }) };
      if (url.endsWith('/content')) return { ok: true, status: 200, json: async () => ({ screen: { menu_banner: [], attract: [] } }) };
      if (url === '/api/vending/payments' && init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ transactions: [{ id: 'txn-1', slotId: 'A01' }] }) };
      if (url === '/api/vending/payments/txn-1') return { ok: true, status: 200, json: async () => ({ status: 'pending', failureReason: null }) };
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} idleTimeoutMs={200} />);
    await waitFor(() => expect(screen.getByText('Korean Spicy Snack')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Korean Spicy Snack to cart/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Your order' })).getByRole('button', { name: /^Pay/ }));
    fireEvent.change(await screen.findByPlaceholderText('07XXXXXXXX'), { target: { value: '0700000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send payment request' }));
    await screen.findByText('Check your phone');

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.getByText('Check your phone')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tap to start your order' })).toBeNull();
  });
});

describe('KioskScreen — published design (§ KIOSK EXPERIENCE)', () => {
  function serve(experience: unknown, items = [catalogItem()]) {
    window.localStorage.setItem(`sq_kiosk_secret_${MACHINE_ID}`, 'secret');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, status: 200, json: async () => ({ catalogVersion: 'v1', items }) };
      if (url.endsWith('/content')) return { ok: true, status: 200, json: async () => ({ packageVersion: 'p1', screen: { menu_banner: [], attract: [] }, experience: { config: experience, version: 'x1' } }) };
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it('applies the design’s colours as tokens and its wording', async () => {
    serve({ theme: { colors: { primary: '#0055aa' } }, copy: { bannerHeadline: 'Snacks at the mall' } });
    const { container } = render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await screen.findByText('Snacks at the mall');
    const root = container.querySelector('[data-kiosk-design]') as HTMLElement;
    expect(root.style.getPropertyValue('--sq-primary')).toBe('#0055aa');
  });

  it('shows the sections in the published order, with a message strip', async () => {
    serve({
      browseSections: [
        { id: 'msg', type: 'promo_message', visible: true, props: { text: 'Two for KES 400 today', tone: 'primary' } },
        { id: 'grid', type: 'product_grid', visible: true, props: { columns: 2 } },
      ],
    });
    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    const note = await screen.findByRole('note');
    expect(note.textContent).toBe('Two for KES 400 today');
    expect(screen.queryByText('Taste the world')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Categories' })).toBeNull();
    expect(screen.getByText('Korean Spicy Snack')).toBeTruthy();
  });

  it('a design that would hide the menu grid is ignored — the built-in design shows', async () => {
    serve({ browseSections: [{ id: 'msg', type: 'promo_message', visible: true, props: { text: 'Nothing to buy' } }] });
    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await screen.findByText('Korean Spicy Snack');
    expect(screen.queryByText('Nothing to buy')).toBeNull();
    expect(screen.getByText('Taste the world')).toBeTruthy();
  });

  it('a colour that isn’t a plain hex colour is never applied', async () => {
    serve({ theme: { colors: { primary: 'url(https://evil.example/x)' } } });
    const { container } = render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await screen.findByText('Korean Spicy Snack');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const root = container.querySelector('[data-kiosk-design]') as HTMLElement;
    expect(root.style.getPropertyValue('--sq-primary')).toBe('#ff7a00');
  });

  it('badge wording comes from the design, and a hidden badge isn’t shown', async () => {
    const featured = { ...catalogItem(), promotionalState: 'featured' as const };
    const fresh = { ...catalogItem({ productId: 'sku-2', slotCode: 'A02', name: 'Fresh Thing' }), promotionalState: 'new' as const };
    serve({ badges: { featured: { label: 'Staff pick' }, new: { visible: false } } }, [featured, fresh] as unknown as ReturnType<typeof catalogItem>[]);
    render(<KioskScreen machineId={MACHINE_ID} machineCode={MACHINE_CODE} />);
    await screen.findByText('Staff pick');
    expect(screen.queryByText('New')).toBeNull();
  });
});

describe('KioskScreen — preview', () => {
  it('renders a given design and menu without pairing or network, and never takes a payment', async () => {
    const { DEFAULT_KIOSK_EXPERIENCE } = await import('@/lib/kiosk/experienceConfig');
    render(
      <KioskScreen
        machineId={MACHINE_ID}
        machineCode={MACHINE_CODE}
        preview={{ experience: { ...DEFAULT_KIOSK_EXPERIENCE, copy: { ...DEFAULT_KIOSK_EXPERIENCE.copy, bannerHeadline: 'Draft headline' } }, catalog: { catalogVersion: 'v1', items: [catalogItem()] }, screen: { menu_banner: [], attract: [] } }}
      />,
    );
    expect(screen.getByText('Draft headline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add Korean Spicy Snack to cart/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Your order' })).getByRole('button', { name: /^Pay/ }));
    fireEvent.change(await screen.findByPlaceholderText('07XXXXXXXX'), { target: { value: '0700000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send payment request' }));
    expect(await screen.findByText(/payments are switched off/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
