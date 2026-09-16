// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CheckoutForm, type CheckoutBox } from '@/components/checkout/CheckoutForm';

/**
 * Two boxes on one order, each choosing its own snacks
 * (§ more than one box per order).
 *
 * A second box could already be added, and the service has resolved
 * picks per line for a while — but the form held exactly one list of
 * picks. Add a Premium to a Deluxe and the second box's five were
 * never asked for and never sent: it went out as a full surprise while
 * the customer believed they had chosen it.
 *
 * What these assert is the seam that was missing, not the picker
 * itself: that each box is asked separately, that neither overwrites
 * the other, and that both sets reach the request.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: { alt: string }) => <img {...props} />,
}));

const boxes: CheckoutBox[] = [
  {
    id: 'premium',
    name: 'Premium Box',
    priceKes: 4500,
    imageUrl: null,
    stockCount: 10,
    snackCountLabel: '12 snacks',
    guaranteedPickCount: 5,
    isRescueOffer: false,
    description: 'Choose five, we surprise you with the rest.',
    highlightLabel: null,
  },
  {
    id: 'deluxe',
    name: 'Deluxe Box',
    priceKes: 6500,
    imageUrl: null,
    stockCount: 10,
    snackCountLabel: '18 snacks',
    guaranteedPickCount: 5,
    isRescueOffer: false,
    description: 'The big one.',
    highlightLabel: null,
  },
];

/** Ten snacks, enough for two boxes of five with none shared. */
const SNACKS = Array.from({ length: 10 }, (_, index) => ({
  id: `snack-${index + 1}`,
  name: `Snack ${index + 1}`,
  imageUrl: null,
  origin: 'Japan',
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/premium-snacks')) {
      return { ok: true, json: async () => ({ snacks: SNACKS }) } as Response;
    }
    // The quote, and anything else the form asks for while assembling.
    return { ok: true, json: async () => ({}) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCheckout() {
  render(
    <CheckoutForm
      boxes={boxes}
      initialBoxId="premium"
      initialReferralCode={null}
      deliveryFromKes={250}
    />,
  );
}

/**
 * Adds the Deluxe alongside the Premium, the way a customer does.
 *
 * Scoped to the "Add another box" disclosure on purpose: the same box
 * name appears on the card above, where tapping it *switches* the
 * primary box rather than adding a second.
 */
function addDeluxe() {
  const disclosure = screen
    .getByText(/add another box/i)
    .closest('details') as HTMLDetailsElement;
  fireEvent.click(within(disclosure).getByRole('button', { name: /deluxe box/i }));
}

/** Advances a stage. The form is one `<form>`; submitting is how it moves. */
function submitForm() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

/** The picker section belonging to one box, found by its own heading. */
async function pickerFor(boxName: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: boxName });
  return heading.closest('div.flex.flex-col.gap-4') as HTMLElement;
}

/** Opens a picker and taps the named snacks inside it. */
async function choose(section: HTMLElement, names: string[]) {
  const disclosure = within(section).getByRole('button', { name: /choose|change|edit|pick/i });
  fireEvent.click(disclosure);
  for (const name of names) {
    const card = await within(section).findByRole('button', {
      name: new RegExp(`^${name}\\b`, 'i'),
    });
    fireEvent.click(card);
  }
}

describe('a second box that also offers picks', () => {
  it('asks for each box separately, naming which is which', async () => {
    renderCheckout();
    addDeluxe();
    submitForm();

    expect(
      await screen.findByRole('heading', { name: /choose 5 snacks for your premium box/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /choose 5 snacks for your deluxe box/i }),
    ).toBeTruthy();
  });

  /*
   * The single-box checkout is the one almost everyone takes, and its
   * heading is a sentence rather than an inventory line. Naming the box
   * when there is only one would be noise.
   */
  it('keeps the plain heading when there is only one box', async () => {
    renderCheckout();
    submitForm();

    expect(await screen.findByRole('heading', { name: /choose your 5 snacks/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /for your premium box/i })).toBeNull();
  });

  it('will not pay until both boxes are full, saying which is short', async () => {
    renderCheckout();
    addDeluxe();
    submitForm();

    const premium = await pickerFor(/premium box/i);
    await choose(premium, ['Snack 1', 'Snack 2', 'Snack 3', 'Snack 4', 'Snack 5']);

    // Premium is complete; the Deluxe is not, and pressing on has to
    // say so rather than refusing silently.
    submitForm();

    // Shown in more than one place on purpose — under the field and in
    // the list beside the pay button — so any is enough.
    expect(
      (await screen.findAllByText(/choose 5 more snacks for your deluxe box/i)).length,
    ).toBeGreaterThan(0);
    // The finished box is not nagged about.
    expect(screen.queryByText(/more snacks for your premium box/i)).toBeNull();
  });

  it('sends each box the snacks chosen for it', async () => {
    renderCheckout();
    addDeluxe();
    submitForm();

    const premium = await pickerFor(/premium box/i);
    await choose(premium, ['Snack 1', 'Snack 2', 'Snack 3', 'Snack 4', 'Snack 5']);
    const deluxe = await pickerFor(/deluxe box/i);
    await choose(deluxe, ['Snack 6', 'Snack 7', 'Snack 8', 'Snack 9', 'Snack 10']);

    submitForm();

    fireEvent.change(await screen.findByLabelText(/full name/i), {
      target: { value: 'Wanjiru Kamau' },
    });
    fireEvent.change(screen.getByLabelText(/m-pesa number/i), {
      target: { value: '0712345678' },
    });
    submitForm();

    fireEvent.change(await screen.findByLabelText(/delivery address/i), {
      target: { value: 'Kilimani, Nairobi' },
    });
    submitForm();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/checkout/web')),
      ).toBe(true);
    });

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/checkout/web'),
    ) as [string, RequestInit];
    const body = JSON.parse(String(call[1].body));

    expect(body.items).toEqual([
      {
        packageId: 'premium',
        quantity: 1,
        guaranteedSnackIds: ['snack-1', 'snack-2', 'snack-3', 'snack-4', 'snack-5'],
      },
      {
        packageId: 'deluxe',
        quantity: 1,
        guaranteedSnackIds: ['snack-6', 'snack-7', 'snack-8', 'snack-9', 'snack-10'],
      },
    ]);
    // The two lists are genuinely different — the bug this replaces
    // would have sent the same five twice, or the second box none.
    expect(body.items[0].guaranteedSnackIds).not.toEqual(body.items[1].guaranteedSnackIds);
  });

  /*
   * The figure shown before the server's quote lands — which is the
   * whole of the first paint, and every moment while a newly added box
   * is being re-quoted. It named the first box and showed only its
   * price, so the fixed bar said KES 5,000 under a panel that had just
   * listed two boxes.
   */
  it('counts both boxes in the total shown before the quote lands', async () => {
    renderCheckout();
    addDeluxe();

    // 4,500 + 6,500 — and the bar has to agree with the panel beside
    // it, which is the disagreement this replaces.
    expect((await screen.findAllByText('KES 11,000')).length).toBeGreaterThan(0);
    const bar = screen.getByText(/your order so far/i).parentElement as HTMLElement;
    expect(within(bar).getByText('KES 11,000')).toBeTruthy();

    // And each box is named with its own price rather than one line
    // carrying the whole order's money.
    expect(screen.getByText(/1 × Premium Box/)).toBeTruthy();
    expect(screen.getByText(/1 × Deluxe Box/)).toBeTruthy();
  });
});
