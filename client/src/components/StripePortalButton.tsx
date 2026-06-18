import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buildApiUrl } from '../config';

type StripePortalButtonProps = {
  orgId?: string | null;
  className?: string;
  label?: string;
  loadingLabel?: string;
  onError?: (message: string) => void;
};

export default function StripePortalButton({
  orgId,
  className = 'vs-button-primary',
  label = 'Manage payment methods',
  loadingLabel = 'Opening Stripe...',
  onError,
}: StripePortalButtonProps) {
  const { user } = useAuth();
  const [opening, setOpening] = useState(false);

  const openPortal = async () => {
    if (!user?.id) {
      onError?.('Sign in before opening billing settings.');
      return;
    }

    setOpening(true);
    onError?.('');
    try {
      const response = await fetch(buildApiUrl('/api/billing/stripe/portal-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ org_id: orgId || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || payload.message || 'Unable to open Stripe Customer Portal.');
      }
      window.location.href = payload.url;
    } catch (error: any) {
      onError?.(error?.message || 'Unable to open Stripe Customer Portal.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <button type="button" onClick={openPortal} disabled={opening || !user?.id} className={className}>
      {opening ? loadingLabel : label}
    </button>
  );
}
