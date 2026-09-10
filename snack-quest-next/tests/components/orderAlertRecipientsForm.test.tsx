// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BusinessSettingsForm,
  DEFAULT_LOYALTY_CONFIG,
  type BusinessSettingsFormValues,
} from '@/components/admin/BusinessSettingsForm';

/**
 * Choosing who gets told when an order comes in
 * (§ order alert recipients).
 *
 * The control this covers replaces a single text input that was, until
 * this change, silently discarded by the settings API — so the thing
 * most worth asserting is not that the rows render but that what the
 * form actually PUTs contains them.
 */
/*
 * jsdom has no ResizeObserver, and the loyalty section of this form
 * renders a Radix Switch that measures itself on mount. Without this
 * the whole form throws before a single assertion runs.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Assigned directly, not via vi.stubGlobal: `unstubAllGlobals()` in
// afterEach would strip it after the first test and every later render
// would throw again.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;

const baseValues: BusinessSettingsFormValues = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'pnid-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: null,
  orderAlertRecipients: [],
  whatsappCustomerNumber: null,
  status: 'active',
  loyaltyConfig: DEFAULT_LOYALTY_CONFIG,
};

function renderForm(overrides: Partial<BusinessSettingsFormValues> = {}) {
  render(<BusinessSettingsForm initialValues={{ ...baseValues, ...overrides }} />);
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
}

function sentBody(): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('order alert numbers', () => {
  it('says plainly when nobody is being told', () => {
    renderForm();
    expect(screen.getByText(/nobody is told when an order arrives/i)).toBeTruthy();
  });

  it('adds a row, and sends it', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /add a number/i }));
    fireEvent.change(screen.getByLabelText(/name for this number/i), {
      target: { value: 'Kelvin' },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '254712345678' },
    });
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().orderAlertRecipients).toEqual([
      { phone: '254712345678', label: 'Kelvin' },
    ]);
  });

  it('keeps more than one', async () => {
    renderForm({
      orderAlertRecipients: [
        { phone: '254711111111', label: 'Kelvin' },
        { phone: '254722222222', label: 'Packing station' },
      ],
    });
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().orderAlertRecipients).toHaveLength(2);
  });

  it('removes the row you asked it to, not the last one', async () => {
    renderForm({
      orderAlertRecipients: [
        { phone: '254711111111', label: 'Kelvin' },
        { phone: '254722222222', label: 'Packing station' },
      ],
    });
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().orderAlertRecipients).toEqual([
      { phone: '254722222222', label: 'Packing station' },
    ]);
  });

  /* Pressing "Add a number" and changing your mind is not an error. */
  it('drops a row left completely blank', async () => {
    renderForm({ orderAlertRecipients: [{ phone: '254711111111', label: 'Kelvin' }] });
    fireEvent.click(screen.getByRole('button', { name: /add a number/i }));
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().orderAlertRecipients).toHaveLength(1);
  });

  it('refuses a number that is not a Kenyan mobile, naming it', async () => {
    renderForm({ orderAlertRecipients: [{ phone: '0712345678', label: 'Kelvin' }] });
    save();

    expect(await screen.findByText(/is not a valid number/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a number with no label, so the list stays readable', async () => {
    renderForm({ orderAlertRecipients: [{ phone: '254711111111', label: '  ' }] });
    save();

    expect(await screen.findByText(/give 254711111111 a label/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses the same number twice', async () => {
    renderForm({
      orderAlertRecipients: [
        { phone: '254711111111', label: 'Kelvin' },
        { phone: '254711111111', label: 'Kelvin again' },
      ],
    });
    save();

    expect(await screen.findByText(/listed twice/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
   * The legacy single field is a fallback for businesses that never
   * used the list. Once the list is saved it has to be cleared, or a
   * removed number keeps being texted through the back door.
   */
  it('clears the legacy single number when saving a list', async () => {
    renderForm({ orderAlertRecipients: [{ phone: '254711111111', label: 'Kelvin' }] });
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().adminOrderSmsPhone).toBeNull();
  });
});

describe('customer-facing WhatsApp number', () => {
  /* Had no field at all before this, while the API already accepted it. */
  it('sends the number the wa.me links need', async () => {
    renderForm({ whatsappCustomerNumber: '254712345678' });
    save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().whatsappCustomerNumber).toBe('254712345678');
  });

  it('refuses a malformed one rather than breaking every WhatsApp link', async () => {
    renderForm({ whatsappCustomerNumber: '+254 712 345 678' });
    save();

    expect(await screen.findByText(/whatsapp customer number must be/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
