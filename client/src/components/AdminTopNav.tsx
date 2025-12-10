import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminTopNav() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();

  const isPlatformAdmin = (user?.user_metadata as any)?.role === 'platform_admin';

  const items: Array<{ to: string; label: string }> = [
    { to: '/admin/orgs', label: 'Orgs' },
    { to: '/admin/users', label: 'Users' },
  ];
  if (isPlatformAdmin) items.push({ to: '/admin/api-keys', label: 'API Keys' });

  return (
    <div className="mb-6 flex items-center gap-3">
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
