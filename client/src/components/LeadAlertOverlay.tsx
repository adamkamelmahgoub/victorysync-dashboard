import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LeadItem, updateLead } from '../lib/apiClient';
import { playLeadAlarmSequence } from '../lib/leadAlarm';
import { postLog } from '../lib/logging';
import { supabase } from '../lib/supabaseClient';

function leadName(lead: LeadItem) {
  return `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown lead';
}

function formatMoney(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(num);
}

function isAcknowledged(lead?: LeadItem | null) {
  return ['accepted', 'declined', 'contacted', 'qualified', 'transferred', 'not_interested', 'no_answer', 'callback'].includes(String(lead?.status || ''));
}

export default function LeadAlertOverlay() {
  const { user, orgs, globalRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<LeadItem[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const activeLead = queue[0] || null;
  const isAdmin = ['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''));

  const activeLeadDetails = useMemo(() => {
    if (!activeLead) return null;
    return {
      name: leadName(activeLead),
      debt: formatMoney(activeLead.debt_amount),
      receivedAt: activeLead.received_at ? new Date(activeLead.received_at).toLocaleTimeString() : 'now',
    };
  }, [activeLead]);

  useEffect(() => {
    if (!user?.id) return;
    const unlock = () => {
      void playLeadAlarmSequence().then((ok) => setSoundBlocked(!ok));
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setQueue([]);
      return;
    }

    const canReceiveLeadAlert = (lead: LeadItem) => {
      if (isAdmin) return true;
      const org = orgs.find((item: any) => item.id === lead.organization_id) as any;
      if (!org) return false;
      const role = String(org.role || '');
      const visibility = org.leads_visibility || {};
      if (role === 'agent' && visibility.agents === false) return false;
      if (role === 'client' && visibility.clients === false) return false;
      return true;
    };

    const channel = supabase
      .channel('victorysync-global-lead-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        if (isAcknowledged(lead)) return;
        if (!canReceiveLeadAlert(lead)) return;
        setQueue((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)].slice(0, 5));
        toast.push(`New lead received - ${leadName(lead)}${lead.state ? ` from ${lead.state}` : ''}`, 'success');
        postLog('/api/logs/activity', {
          event_type: 'notification',
          event_name: 'Global new lead alert shown',
          page: window.location.pathname,
          element: 'global-lead-alert-overlay',
          metadata: { lead_id: lead.id, source: lead.source },
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        setQueue((prev) => {
          if (isAcknowledged(lead)) return prev.filter((item) => item.id !== lead.id);
          return prev.map((item) => item.id === lead.id ? lead : item);
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [globalRole, isAdmin, orgs, toast, user?.id]);

  useEffect(() => {
    if (!activeLead) return;
    let cancelled = false;
    const alarm = () => {
      void playLeadAlarmSequence().then((ok) => {
        if (!cancelled) setSoundBlocked(!ok);
      });
    };
    alarm();
    const id = window.setInterval(alarm, 900);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeLead?.id]);

  const acknowledge = async (status: 'accepted' | 'declined') => {
    if (!activeLead || !user?.id) return;
    const leadId = activeLead.id;
    setQueue((prev) => prev.filter((item) => item.id !== leadId));
    try {
      await updateLead(leadId, status === 'accepted' ? { status, assign_to_me: true } : { status }, user.id);
      postLog('/api/logs/activity', {
        event_type: 'lead_acknowledged',
        event_name: status === 'accepted' ? 'Accepted lead from global alert' : 'Declined lead from global alert',
        page: window.location.pathname,
        element: 'global-lead-alert-overlay',
        metadata: { lead_id: leadId, status },
      });
      if (status === 'accepted') {
        navigate(`/dashboard/leads?lead_id=${encodeURIComponent(leadId)}`);
      }
    } catch {
      setQueue((prev) => [activeLead, ...prev.filter((item) => item.id !== leadId)]);
      toast.push(`Failed to ${status} lead`, 'error');
    }
  };

  if (!activeLead || !activeLeadDetails) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/95 p-4 text-white backdrop-blur-md">
      <div className="absolute inset-0 animate-pulse bg-rose-500/[0.12]" />
      <div className="relative w-full max-w-5xl rounded-[32px] border border-rose-300/30 bg-[linear-gradient(180deg,rgba(127,29,29,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-10">
        <div className="text-center">
          <div className="inline-flex rounded-full border border-rose-200/30 bg-rose-300/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-rose-100">
            New Lead Alert
          </div>
          <h2 className="mt-6 text-4xl font-black tracking-normal text-white sm:text-6xl">
            {activeLeadDetails.name}
          </h2>
          <p className="mt-4 text-xl font-semibold text-rose-100 sm:text-2xl">
            {activeLead.state || 'Unknown state'} · {activeLeadDetails.debt} debt
          </p>
          <p className="mt-2 text-sm text-rose-100/70">
            Received {activeLeadDetails.receivedAt}
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Phone" value={activeLead.phone || '-'} />
          <Info label="Source" value={activeLead.opt_in_source || activeLead.source || '-'} />
          <Info label="Trusted ID" value={activeLead.trusted_id || '-'} />
          <Info label="Form" value={activeLead.form_number || '-'} />
        </div>

        {soundBlocked && (
          <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-center text-sm text-amber-100">
            Browser sound is blocked until this tab is interacted with.
            <button className="ml-2 font-semibold underline" onClick={() => void playLeadAlarmSequence().then((ok) => setSoundBlocked(!ok))}>
              Enable alarm
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-2xl bg-emerald-300 px-6 py-5 text-lg font-black uppercase tracking-[0.14em] text-emerald-950 shadow-[0_18px_40px_rgba(16,185,129,0.22)] transition hover:bg-emerald-200"
            onClick={() => void acknowledge('accepted')}
            data-log="Accept global lead alert"
          >
            Accept Lead
          </button>
          <button
            className="rounded-2xl border border-white/20 bg-white/10 px-6 py-5 text-lg font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/15"
            onClick={() => void acknowledge('declined')}
            data-log="Decline global lead alert"
          >
            Decline
          </button>
        </div>

        {queue.length > 1 && (
          <div className="mt-5 text-center text-sm font-medium text-rose-100/80">
            {queue.length - 1} more lead{queue.length === 2 ? '' : 's'} waiting
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-100/60">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
