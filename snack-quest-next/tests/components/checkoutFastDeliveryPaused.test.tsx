// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckoutForm, type CheckoutBox } from '@/components/checkout/CheckoutForm';

/**
 * What the checkout says when a fast service is switched off for the
 * day (§ same-day switch).
 *
 * The cut-offs only know the hour, so before 1pm every clock-based
 * rule says same-day is on sale. The switch is for the case they
 * cannot see: nobody here to pack. What matters on screen is not just
 * that the option is dead but that it gives the real reason — a
 * customer told "orders must be in by 1pm" at nine in the morning
 * comes back at noon to the same refusal.
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
    id: 'box-1',
    name: 'Explorer Box',
    priceKes: 3500,
    imageUrl: null,
    stockCount: 10,
    snackCountLabel: '10 snacks',
    guaranteedPickCount: 0,
    isRescueOffer: false,
    description: 'A mix of imported snacks.',
    highlightLabel: null,
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ snacks: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCheckout(props: { sameDayPaused?: boolean; expressPaused?: boolean } = {}) {
  render(
    <CheckoutForm
      boxes={boxes}
      initialBoxId="box-1"
      initialReferralCode={null}
      deliveryFromKes={250}
      {...props}
    />,
  );
}

/** Walks to the delivery stage, where the speeds are chosen. */
function goToDelivery() {
  const form = document.querySelector('form') as HTMLFormElement;
  // Box, then details, then delivery.
  fireEvent.submit(form);
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Wanjiru Kamau' } });
  fireEvent.change(screen.getByLabelText(/m-pesa number/i), { target: { value: '0712345678' } });
  fireEvent.submit(form);
}

/** The speed tile, found by its title. */
function speedTile(name: RegExp): HTMLElement {
  return screen.getByText(name).closest('button, [role="radio"], div') as HTMLElement;
}

describe('same-day switched off', () => {
  it('says it is unavailable today rather than naming the cut-off', () => {
    renderCheckout({ sameDayPaused: true });
    goToDelivery();

    expect(screen.getByText(/not available today\. next day arrives tomorrow\./i)).toBeTruthy();
    // The cut-off is not the reason, so it is not quoted.
    expect(screen.queryByText(/orders must be in by 1pm/i)).toBeNull();
  });

  it('will not let the option be chosen', () => {
    renderCheckout({ sameDayPaused: true });
    goToDelivery();

    const tile = speedTile(/^Same day$/);
    fireEvent.click(tile);

    // Still on next-day: a dead control that silently selects is worse
    // than one that refuses.
    expect(screen.queryByText(/delivery by 6:00 pm today/i)).toBeNull();
  });

  /*
   * The two switches are independent. Express has its own clock window
   * so it may be closed anyway — what this pins is that same-day's
   * switch does not describe express as switched off.
   */
  it('does not report express as switched off too', () => {
    renderCheckout({ sameDayPaused: true });
    goToDelivery();

    expect(screen.getAllByText(/not available today/i)).toHaveLength(1);
  });
});

describe('express switched off', () => {
  it('says it is unavailable today', () => {
    renderCheckout({ expressPaused: true });
    goToDelivery();

    expect(screen.getAllByText(/not available today/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/opens at 10am/i)).toBeNull();
  });
});

describe('neither switched off', () => {
  /* The default, and what every caller that predates the switches gets. */
  it('never claims a service is unavailable today', () => {
    renderCheckout();
    goToDelivery();

    expect(screen.queryByText(/not available today/i)).toBeNull();
    // Next-day is not switchable and is always on offer.
    expect(screen.getByText(/delivered by 4:00 pm the following day/i)).toBeTruthy();
  });
});
