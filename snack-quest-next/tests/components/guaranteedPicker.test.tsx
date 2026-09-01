// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuaranteedPicker, type SelectableSnack } from '@/components/checkout/GuaranteedPicker';

/**
 * How much a single tap costs (§ picker responsiveness).
 *
 * A customer reported the pick-5 grid lagging. Production carries 62
 * snacks, every one with an image, and the grid lives inside a
 * 1,400-line form holding 23 pieces of state — so every tap on a
 * snack, and every keystroke anywhere else in the form, re-rendered all
 * 62 cards.
 *
 * These count real renders rather than asserting that memoization is
 * present, because `memo` is easy to add and just as easy to defeat: an
 * inline callback or an array prop makes it compare unequal every time
 * and the component looks optimized while re-rendering exactly as
 * before.
 */

const SNACK_COUNT = 62;

const snacks: SelectableSnack[] = Array.from({ length: SNACK_COUNT }, (_, i) => ({
  id: `snack-${i}`,
  name: `Snack ${i}`,
  origin: 'Japan',
  imageUrl: `https://example.test/snack-${i}.jpg`,
}));

/** Counts how many times each card's image is constructed, which is one per card render. */
let cardRenders = 0;

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => {
    cardRenders += 1;
    // This IS the stand-in for next/image, so the rule telling us to
    // use next/image here has nothing to suggest.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

beforeEach(() => {
  cardRenders = 0;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ snacks }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The picker inside a parent that also holds unrelated state, which is the situation that made this slow. */
function Harness() {
  const [picks, setPicks] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const handleChange = (ids: string[]) => setPicks(ids);

  return (
    <>
      <input aria-label="address" value={address} onChange={(e) => setAddress(e.target.value)} />
      <GuaranteedPicker required={5} selectedIds={picks} onChange={handleChange} />
    </>
  );
}

async function openGrid() {
  render(<Harness />);
  // The list is fetched on mount; the toggle only appears once it lands.
  // The disclosure is labelled by its live count ("0 of 5 chosen"),
  // not by the word "pick".
  const toggle = await screen.findByRole('button', { expanded: false });
  fireEvent.click(toggle);
  await screen.findByRole('button', { name: /Snack 1 of 62/ });
}

describe('tapping a snack', () => {
  it('re-renders only the card that changed, not all 62', async () => {
    await openGrid();

    cardRenders = 0;
    fireEvent.click(screen.getByRole('button', { name: /Snack 4 of 62/ }));
    await screen.findByRole('button', { name: /Snack 4 of 62/, pressed: true });

    /*
     * One card changed, so one card re-renders. Before the memo this
     * was 62, and on a mid-range phone on mobile data that is what the
     * customer felt.
     */
    expect(cardRenders).toBeLessThanOrEqual(2);
  });

  it('still selects and deselects correctly', async () => {
    await openGrid();

    fireEvent.click(screen.getByRole('button', { name: /Snack 2 of 62/ }));
    expect(screen.getByRole('button', { name: /Snack 2 of 62/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Snack 2 of 62/ }));
    expect(screen.getByRole('button', { name: /Snack 2 of 62/ }).getAttribute('aria-pressed')).toBe('false');
  });

  /** The limit still holds — a faster grid that lets someone pick six would be a worse grid. */
  it('refuses a sixth pick', async () => {
    await openGrid();

    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Snack ${i + 1} of 62`) }));
    }
    fireEvent.click(screen.getByRole('button', { name: /Snack 6 of 62/ }));

    expect(screen.getByRole('button', { name: /Snack 6 of 62/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Snack 1 of 62/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('typing elsewhere in the form', () => {
  /*
   * The half of the problem that had nothing to do with the picker. The
   * grid is a sibling of every other field, so without a memo on the
   * component itself, typing one character in an address re-rendered 62
   * image cards.
   */
  it('does not re-render the grid at all', async () => {
    await openGrid();

    cardRenders = 0;
    fireEvent.change(screen.getByLabelText('address'), { target: { value: 'Kilimani' } });

    expect(cardRenders).toBe(0);
  });
});
