// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffInitiatedOrderDialog } from '@/components/admin/StaffInitiatedOrderDialog';

/**
 * Choosing whether the customer hears about a staff-entered order
 * (§ quiet manual orders) — the control itself.
 *
 * The service tests prove that a muted order stays quiet. What they
 * cannot prove is that a staff member can actually reach that state
 * from the form, which is the only way anyone will ever use it. This
 * covers the seam between the two: the checkbox exists, it defaults to
 * telling the customer, and unticking it is what puts
 * `notifyCustomer: false` in the request body.
 *
 * Without this the feature could be complete on the server and
 * unreachable in the product, and every test would still pass.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

/* jsdom has no ResizeObserver, and the dialog renders Radix primitives
   that measure themselves on mount. Assigned directly rather than via
   `vi.stubGlobal`, or `unstubAllGlobals()` strips it after the first
   test and every later render throws. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const boxes = [
  { id: 'box-1', name: 'Starter Box', priceKes: 3500, stockCount: 10, guaranteedPickCount: 0 },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        checkoutSessionId: 'session-1',
        pricing: { totalKes: 3750, quantity: 1 },
        stkPushSent: false,
        payingPhone: '254712345678',
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function openDialog() {
  render(
    <StaffInitiatedOrderDialog
      boxes={boxes as unknown as Parameters<typeof StaffInitiatedOrderDialog>[0]['boxes']}
      canRecordManualPayment
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /new order|take an order|record an order/i }));
}

/** The body of the order request, once one has been sent. */
function sentBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).includes('/api/admin/orders/initiate'),
  );
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

/*
 * Door delivery rather than the default pickup, deliberately: pickup
 * needs a station chosen from a list this test would have to stub,
 * and none of that is what is being tested here.
 */
async function fillAndSubmit() {
  fireEvent.click(screen.getByRole('button', { name: /nairobi door/i }));
  fireEvent.change(document.getElementById('staff-order-name') as HTMLInputElement, {
    target: { value: 'Wanjiru Kamau' },
  });
  fireEvent.change(document.getElementById('staff-order-phone') as HTMLInputElement, {
    target: { value: '0712345678' },
  });
  const address = document.getElementById('staff-order-address') as HTMLInputElement | null;
  if (address) {
    fireEvent.change(address, { target: { value: 'Kilimani, Argwings Kodhek Rd' } });
  }
  fireEvent.click(screen.getByRole('button', { name: /send payment request/i }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/admin/orders/initiate')),
    ).toBe(true),
  );
}

describe('the notify-the-customer control', () => {
  it('is on the form, and on by default', () => {
    openDialog();

    const toggle = screen.getByRole('checkbox', { name: /tell the customer about this order/i });
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  /*
   * The wording changes with the state, because "no message will be
   * sent" is a consequence somebody should read before they save, not
   * discover from a customer's reply.
   */
  it('says what each state means', () => {
    openDialog();
    const toggle = screen.getByRole('checkbox', { name: /tell the customer about this order/i });

    expect(screen.getByText(/usual confirmation/i)).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByText(/no confirmation and no dispatch text/i)).toBeTruthy();
    expect(screen.getByText(/send the confirmation by hand/i)).toBeTruthy();
  });

  /*
   * The assertion the whole feature rests on. Everything else could be
   * right — the checkbox, the copy, the service — and this one line
   * missing would leave the switch doing nothing at all.
   */
  it('puts notifyCustomer: false in the request when switched off', async () => {
    openDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: /tell the customer about this order/i }));
    await fillAndSubmit();

    expect(sentBody().notifyCustomer).toBe(false);
  });

  /* Left alone, the request is exactly the one it always was. */
  it('sends no such field when left on', async () => {
    openDialog();
    await fillAndSubmit();

    expect('notifyCustomer' in sentBody()).toBe(false);
  });
});
