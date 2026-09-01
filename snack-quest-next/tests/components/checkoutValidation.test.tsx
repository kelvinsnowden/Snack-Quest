// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckoutForm, type CheckoutBox } from '@/components/checkout/CheckoutForm';

/**
 * How the checkout tells a customer what is wrong (§ checkout audit).
 *
 * All of this used to be one joined sentence under the pay button:
 * printed before anyone had typed a character, hidden entirely on
 * mobile, and never saying which field it meant. These assert the
 * three properties that replaced it — quiet until asked, attached to
 * the field, and reachable from the button.
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

function renderCheckout() {
  render(
    <CheckoutForm
      boxes={boxes}
      initialBoxId="box-1"
      initialReferralCode={null}
      deliveryFromKes={250}
    />,
  );
}

describe('before the customer has touched anything', () => {
  /*
   * The served HTML used to open with "Still needed: Enter your name ·
   * Enter a valid Kenyan mobile number · Choose 5 snacks to continue ·
   * Enter your delivery address" — a list of four things you had done
   * wrong before you had done anything at all.
   */
  it('says nothing about fields the customer has not reached', () => {
    renderCheckout();

    expect(screen.queryByText(/Enter your name/i)).toBeNull();
    expect(screen.queryByText(/Use a Kenyan mobile number/i)).toBeNull();
    expect(screen.queryByText(/things left/i)).toBeNull();
  });

  /** The one control the customer came to press is never dead under a tap. */
  it('leaves the pay button pressable, and a real submit control', () => {
    renderCheckout();

    const buttons = screen.getAllByRole('button', { name: /pay with m-pesa/i });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(button.getAttribute('type')).toBe('submit');
    }
  });
});

describe('leaving a field', () => {
  it('explains that one field, and only that one', () => {
    renderCheckout();

    fireEvent.blur(screen.getByLabelText(/full name/i));

    expect(screen.getByText('Enter your name.')).toBeTruthy();
    // The phone has not been visited, so it stays quiet.
    expect(screen.queryByText(/Use a Kenyan mobile number/i)).toBeNull();
  });

  /*
   * A verdict is not actionable; a shape is. "Enter a valid Kenyan
   * mobile number" tells somebody their number is wrong without
   * telling them what right looks like.
   */
  it('shows the expected shape rather than calling the number invalid', () => {
    renderCheckout();

    const phone = screen.getByLabelText(/m-pesa number/i);
    fireEvent.change(phone, { target: { value: '12345' } });
    fireEvent.blur(phone);

    // Matches more than once now: the helper text carries the same
    // example, which is the point — the shape is shown before it is
    // ever needed as a correction.
    expect(screen.getAllByText(/0712 345 678/).length).toBeGreaterThan(0);
    expect(document.getElementById('checkout-phone-error')?.textContent).toMatch(/0712 345 678/);
  });

  it('clears the message once the field is right', () => {
    renderCheckout();

    const name = screen.getByLabelText(/full name/i);
    fireEvent.blur(name);
    expect(screen.getByText('Enter your name.')).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Wanjiru Kamau' } });
    expect(screen.queryByText('Enter your name.')).toBeNull();
  });

  /** The message is tied to its input, so it is announced with the field rather than as a loose alert. */
  it('links the message to the field for assistive technology', () => {
    renderCheckout();

    const name = screen.getByLabelText(/full name/i);
    fireEvent.blur(name);

    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('checkout-name-error');
    expect(document.getElementById('checkout-name-error')).toBeTruthy();
  });
});

describe('pressing pay on an incomplete form', () => {
  /*
   * The press has to teach. Previously the button was disabled, so the
   * one thing a customer instinctively does — press the button they
   * came for — produced nothing at all.
   */
  it('reveals every outstanding message at once', () => {
    renderCheckout();

    /*
     * Submitting the form rather than clicking the button: jsdom does
     * not perform implicit submission from a button press, so a click
     * here would prove nothing about the handler. That the button is a
     * live submit control is asserted on its own above.
     */
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    // Each appears twice on purpose: once under its own field, and
    // once in the roll-up beside the button, so the customer sees the
    // count without hunting.
    expect(screen.getAllByText('Enter your name.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Use a Kenyan mobile number/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/things left/i).length).toBeGreaterThan(0);
    expect(document.getElementById('checkout-name-error')).toBeTruthy();
  });

  /** It must not start a payment for a form the server would refuse. */
  it('does not call the checkout API', () => {
    renderCheckout();

    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((call) => String(call[0]).includes('/api/checkout/web'))).toBe(false);
  });
});

describe('what the customer is told before paying', () => {
  /*
   * True and specific, rather than a padlock icon. The prompt is
   * Safaricom's and no page on this site ever asks for a PIN, which is
   * worth saying at the exact moment somebody is about to type one.
   */
  it('says where the PIN is entered', () => {
    renderCheckout();

    expect(screen.getByText(/never on this page/i)).toBeTruthy();
  });

  /** The first paint has no quote yet, and used to show a bare figure with nothing saying what it was. */
  it('says delivery is still to be added, rather than showing a bare number', () => {
    renderCheckout();

    expect(screen.getByText(/Delivery is added once you choose/i)).toBeTruthy();
  });
});

describe('the payment decision', () => {
  /*
   * The three facts a customer needs at the moment of committing money
   * were each on screen somewhere — amount in the summary, method in a
   * sentence, number four sections up — and had to be assembled from
   * memory. Absent until the form is actually payable, because a
   * "you're paying" block on an incomplete order states a total that
   * is not yet true.
   */
  it('stays hidden while the order is incomplete', () => {
    renderCheckout();
    expect(screen.queryByText(/You're paying/i)).toBeNull();
  });

  /** Every step named is one this system performs, not a reassuring sequence invented for the page. */
  it('lists what happens after payment, before payment', () => {
    renderCheckout();

    expect(screen.getByText(/Enter your PIN there, never on this page/i)).toBeTruthy();
    expect(screen.getByText(/shows your order number/i)).toBeTruthy();
    expect(screen.getByText(/We text that order number to you/i)).toBeTruthy();
    expect(screen.getByText(/your box is on its way/i)).toBeTruthy();
  });
});

describe('the phone field', () => {
  /*
   * Grouped as it is typed, so the shape is visible at the digit where
   * a mistake was made rather than after leaving the field. Only the
   * display changes — what reaches Daraja is normalized server-side,
   * because that number decides who gets charged.
   */
  it('groups a local number as the customer types', () => {
    renderCheckout();

    const phone = screen.getByLabelText(/m-pesa number/i) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '0712345678' } });

    expect(phone.value).toBe('0712 345 678');
  });

  it('keeps an international number in the form the customer chose', () => {
    renderCheckout();

    const phone = screen.getByLabelText(/m-pesa number/i) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '+254712345678' } });

    expect(phone.value).toBe('+254 712 345 678');
  });

  /** A pasted number with its own spacing still lands in one shape. */
  it('re-groups a number pasted with other spacing', () => {
    renderCheckout();

    const phone = screen.getByLabelText(/m-pesa number/i) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '07 12 345 678' } });

    expect(phone.value).toBe('0712 345 678');
  });

  it('shows the expected shape as helper text, not only on error', () => {
    renderCheckout();
    expect(screen.getByText(/e\.g\. 0712 345 678/i)).toBeTruthy();
  });
});

describe('section headings', () => {
  /*
   * These were numbered, and the numbers moved: a box offering picks
   * made "Your details" step 3, one without them made it step 2. The
   * count was unstable across the exact comparison a customer makes
   * when switching boxes.
   */
  it('names sections rather than numbering them', () => {
    renderCheckout();

    expect(screen.getByRole('heading', { name: 'Your box' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Where it's going" })).toBeTruthy();
    expect(screen.queryByText(/^Step \d/)).toBeNull();
  });
});
