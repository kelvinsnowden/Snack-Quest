import React, { useCallback, useEffect, useState } from 'react';
import { CreatorAuthGate } from '../creator/CreatorAuthGate';
import { CreatorShell } from '../creator/CreatorShell';
import { WithdrawModal } from '../creator/WithdrawModal';
import { CreatorDashboardPayload, clearStoredCreatorId, fetchCreatorDashboard, loadStoredCreatorId } from '../creator/creatorApi';

export const CreatorPortal: React.FC = () => {
  const [creatorId, setCreatorId] = useState<string | null>(() => loadStoredCreatorId());
  const [payload, setPayload] = useState<CreatorDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const loadDashboard = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCreatorDashboard(id);
      setPayload(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong loading your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (creatorId) {
      loadDashboard(creatorId);
    }
  }, [creatorId, loadDashboard]);

  const handleSignOut = () => {
    clearStoredCreatorId();
    setCreatorId(null);
    setPayload(null);
  };

  if (!creatorId) {
    return <CreatorAuthGate onAuthenticated={setCreatorId} />;
  }

  return (
    <div className="min-h-screen bg-creator-canvas text-creator-ink font-sans antialiased">
      <CreatorShell
        payload={payload}
        loading={loading}
        error={error}
        onRetry={() => loadDashboard(creatorId)}
        onSignOut={handleSignOut}
        onOpenWithdraw={() => setWithdrawOpen(true)}
      />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableBalanceKes={payload?.wallet.available_balance_kes ?? 0}
        defaultPhone=""
        onSuccess={() => loadDashboard(creatorId)}
      />
    </div>
  );
};
