import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { FormField } from '../common/FormField';
import { useApp } from '../../context/AppContext';
import { requestWithdrawal } from './creatorApi';
import { formatKes } from './format';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorId: string;
  availableCashKes: number;
  defaultPhone: string;
  onSuccess: () => void;
}

const MIN_WITHDRAWAL_KES = 500;

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  creatorId,
  availableCashKes,
  defaultPhone,
  onSuccess
}) => {
  const { addToast } = useApp();
  const [amount, setAmount] = useState(String(Math.min(1000, Math.max(availableCashKes, 0)) || ''));
  const [phone, setPhone] = useState(defaultPhone);
  const [submitting, setSubmitting] = useState(false);

  const amountNumber = Number(amount);
  const amountError =
    amount && (Number.isNaN(amountNumber) || amountNumber < MIN_WITHDRAWAL_KES)
      ? `Minimum withdrawal is ${formatKes(MIN_WITHDRAWAL_KES)}`
      : amount && amountNumber > availableCashKes
      ? 'Amount exceeds your available cash'
      : undefined;

  const canSubmit = !amountError && amountNumber > 0 && phone.trim().length >= 9 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await requestWithdrawal(creatorId, amountNumber, phone.trim());
      addToast({ type: 'success', title: 'Withdrawal requested', message: `${formatKes(amountNumber)} is on its way to ${phone}.` });
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Withdrawal failed', message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdraw earnings" description={`Available cash: ${formatKes(availableCashKes)}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Amount (KES)"
          type="number"
          required
          min={MIN_WITHDRAWAL_KES}
          max={availableCashKes}
          value={amount}
          error={amountError}
          onChange={(e) => setAmount((e.target as HTMLInputElement).value)}
        />
        <FormField
          label="M-Pesa number"
          type="tel"
          required
          placeholder="0722000111"
          value={phone}
          onChange={(e) => setPhone((e.target as HTMLInputElement).value)}
          helpText="Funds are sent directly to this number."
        />
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-creator-control border border-creator-border text-creator-ink-muted hover:text-creator-ink hover:bg-creator-surface-hover text-creator-body font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Requesting…' : 'Confirm withdrawal'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
