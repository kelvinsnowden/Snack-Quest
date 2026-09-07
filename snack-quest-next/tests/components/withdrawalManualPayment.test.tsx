// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WithdrawalActions } from '@/components/admin/WithdrawalActions';

/**
 * Recording a payout that already happened
 * (§ pay a withdrawal manually).
 *
 * The service tests cover the money. This covers the control that
 * reaches it, and one property in particular: that the manual path
 * cannot be mistaken for the B2C one. Approve sends real money to a
 * phone; this only writes down money already sent. A person who
 * confuses the two pays a creator twice, so the two must not be one
 * click apart with the same wording.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function openManualDialog() {
  render(<WithdrawalActions withdrawalId="w-1" amountKes={2000} />);
  fireEvent.click(screen.getByRole('button', { name: /paid manually/i }));
}

describe('the "paid manually" action', () => {
  it('offers it alongside approve and reject', () => {
    render(<WithdrawalActions withdrawalId="w-1" amountKes={2000} />);

    expect(screen.getByRole('button', { name: /^approve$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /paid manually/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeTruthy();
  });

  /* The distinction that stops somebody paying twice. */
  it('says plainly that nothing is sent to Safaricom', () => {
    openManualDialog();

    expect(screen.getByText(/nothing is sent\s+to safaricom/i)).toBeTruthy();
  });

  it('posts the reference and note to the manual endpoint', async () => {
    openManualDialog();

    fireEvent.change(screen.getByLabelText(/m-pesa code/i), { target: { value: 'UI4CP57HIJ' } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Sent from the app' } });
    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/withdrawals/w-1/pay-manually');
    expect(JSON.parse(init.body)).toEqual({ reference: 'UI4CP57HIJ', note: 'Sent from the app' });
  });

  /*
   * Checked here as well as on the server, so the dialog names the
   * missing field instead of the request coming back with an error
   * about a form still on screen.
   */
  it('will not submit without an M-Pesa code', async () => {
    openManualDialog();
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Sent from the app' } });

    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));

    expect(await screen.findByText(/m-pesa code from the transfer is required/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('will not submit without a note', async () => {
    openManualDialog();
    fireEvent.change(screen.getByLabelText(/m-pesa code/i), { target: { value: 'UI4CP57HIJ' } });

    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));

    expect(await screen.findByText(/a note is required/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** A 409 is the double-payment guard; the admin has to see why. */
  it('surfaces the server’s reason when the withdrawal has already left pending', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Cannot pay_manually a withdrawal that is approved.' }), { status: 409 }),
    );
    openManualDialog();
    fireEvent.change(screen.getByLabelText(/m-pesa code/i), { target: { value: 'UI4CP57HIJ' } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Sent from the app' } });

    fireEvent.click(screen.getByRole('button', { name: /mark as paid/i }));

    expect(await screen.findByText(/cannot pay_manually a withdrawal that is approved/i)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
