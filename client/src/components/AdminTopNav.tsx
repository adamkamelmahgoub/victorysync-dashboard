import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminTopNav() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const { orgs, selectedOrgId, setSelectedOrgId } = useAuth();

  const isPlatformAdmin = (user?.user_metadata as any)?.role === 'platform_admin';

  const items: Array<{ to: string; label: string }> = [
    { to: '/admin/orgs', label: 'Orgs' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/support', label: 'Support Tickets' },
    { to: '/admin/number-change-requests', label: 'Phone Requests' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/recordings', label: 'Recordings' },
    { to: '/admin/sms', label: 'SMS' },
    { to: '/admin/billing', label: 'Billing' },
    { to: '/admin/mightycall', label: 'Integrations' },
    { to: '/admin/operations', label: 'Operations' },
  ];
  if (isPlatformAdmin) items.push({ to: '/admin/api-keys', label: 'API Keys' });

  return (
    <div className="mb-6 flex items-center gap-3">
      {orgs && orgs.length > 0 && (
        <div className="ml-2">
          <select
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId(e.target.value || null)}
            className="bg-slate-800 text-sm text-slate-200 px-2 py-1 rounded border border-slate-700"
          >
            <option value="">All orgs</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}
      {items.map((it) => (
        <button
          key={it.to}
          onClick={() => navigate(it.to)}
          className={`px-3 py-1.5 text-sm rounded ${loc.pathname.startsWith(it.to) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50' : 'text-slate-400 hover:text-slate-300'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
