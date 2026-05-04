import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminTopNav() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { user, orgs, selectedOrgId, setSelectedOrgId } = useAuth();

  const isPlatformAdmin = (user?.user_metadata as any)?.role === 'platform_admin';

  const items: Array<{ to: string; label: string }> = [
    { to: '/admin/orgs', label: 'Orgs' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/agents-management', label: 'Agent Management' },
    { to: '/admin/invites', label: 'Invites' },
    { to: '/admin/support', label: 'Support Tickets' },
    { to: '/admin/number-change-requests', label: 'Phone Requests' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/recordings', label: 'Recordings' },
    { to: '/sms', label: 'SMS' },
    { to: '/admin/billing', label: 'Billing' },
    { to: '/admin/mightycall', label: 'Integrations' },
    { to: '/admin/diagnostics', label: 'Diagnostics' },
    { to: '/admin/operations', label: 'Operations' },
  ];
  if (isPlatformAdmin) items.push({ to: '/admin/api-keys', label: 'API Keys' });

  return (
    <div className="vs-surface mb-6 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Admin workspace</div>
          <div className="mt-2 text-sm text-slate-300">Cross-client operations, configuration, and monitoring</div>
        </div>
        {orgs && orgs.length > 0 && (
          <select
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId(e.target.value || null)}
            className="vs-input min-w-[220px]"
          >
            <option value="">All orgs</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto px-3 py-3">
        <div className="flex min-w-max gap-2">
          {items.map((it) => {
            const active = loc.pathname.startsWith(it.to);
            return (
              <button
                key={it.to}
                onClick={() => navigate(it.to)}
                className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-white/[0.07] text-white ring-1 ring-cyan-400/20'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
